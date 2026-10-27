// DriveMatch front end: builds the preference form, calls /api/recommend,
// renders ranked cards with explanations, and logs every interaction to /api/events.

const $ = (s) => document.querySelector(s);
const PRETTY = {
  hatchback: "Hatchback", sedan: "Sedan", micro_suv: "Micro SUV", compact_suv: "Compact SUV",
  midsize_suv: "Mid-size SUV", large_suv: "Large SUV", mpv: "MPV / 7-seater",
  petrol: "Petrol", diesel: "Diesel", cng: "CNG", hybrid: "Hybrid", electric: "Electric",
  any: "Any", manual: "Manual", automatic: "Automatic",
  safety: "Safety", performance: "Performance", space: "Space", efficiency: "Efficiency",
};
const pretty = (k) => PRETTY[k] || k;

function getUserId() {
  let id = null;
  try { id = localStorage.getItem("dm_user"); } catch (_) {}
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem("dm_user", id); } catch (_) {}
  }
  return id;
}
const USER_ID = getUserId();
let lastRecId = null;
let testDriveTarget = null;
let compareList = []; // [{vehicle, match_pct, rank}, ...] max 3

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 1800);
}

function chips(container, items, { multi = true, initial = [] } = {}) {
  const el = $(container);
  items.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = el.classList.contains("seg") ? "" : "chip";
    b.textContent = label; b.dataset.key = key;
    b.setAttribute("aria-pressed", initial.includes(key));
    b.onclick = () => {
      if (!multi) el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", false));
      b.setAttribute("aria-pressed", multi ? b.getAttribute("aria-pressed") !== "true" : true);
    };
    el.appendChild(b);
  });
}
const picked = (container) =>
  [...document.querySelectorAll(`${container} [aria-pressed=true]`)].map((b) => b.dataset.key);

async function api(path, body, method) {
  const m = method || (body ? "POST" : "GET");
  const res = await fetch(path, (body !== undefined && body !== null) ? {
    method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : undefined);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.detail)
      ? data.detail.map(e => `${e.loc?.slice(-1)[0] ?? ""}: ${e.msg}`).join("; ")
      : (data.detail || res.statusText);
    throw new Error(msg);
  }
  return res.json();
}

function logEvent(event_type, vehicle_id, position, value) {
  return api("/api/events", {
    user_id: USER_ID, event_type, vehicle_id, position,
    recommendation_id: lastRecId, value,
  }).catch(() => {});
}

async function init() {
  const o = await api("/api/options");
  chips("#bodyTypes", o.body_types.map((k) => ({ key: k, label: pretty(k) })), { initial: ["compact_suv"] });
  chips("#fuels", o.fuels.map((k) => ({ key: k, label: pretty(k) })));
  chips("#transmission", o.transmissions.map((k) => ({ key: k, label: pretty(k) })), { multi: false, initial: ["any"] });
  chips("#features", o.features.map((f) => ({ key: f.key, label: f.label })), { initial: ["sunroof", "six_airbags"] });
  chips("#priorities", o.priorities.map((k) => ({ key: k, label: pretty(k) })), { initial: ["safety"] });
}

$("#searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#searchQ").value.trim();
  if (!q) return;
  $("#status").textContent = "Searching…";
  $("#parsedTags").hidden = true;
  try {
    const out = await api("/api/search", { user_id: USER_ID, q, k: 10 });
    lastRecId = out.recommendation_id;
    if (out.parsed_tags.length) {
      $("#parsedTags").innerHTML = out.parsed_tags.map(t => `<span class="parsed-tag">${t}</span>`).join("");
      $("#parsedTags").hidden = false;
    }
    render(out);
  } catch (err) {
    $("#status").textContent = "Search failed: " + err.message;
  }
});

$("#prefs").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#parsedTags").hidden = true;
  const seats = $("#minSeats").value;
  const prefs = {
    budget_min: parseFloat($("#budgetMin").value || 0),
    budget_max: parseFloat($("#budgetMax").value),
    body_types: picked("#bodyTypes"),
    fuels: picked("#fuels"),
    fuel_strict: $("#fuelStrict").checked,
    transmission: picked("#transmission")[0] || "any",
    must_have_features: picked("#features"),
    priorities: picked("#priorities"),
    min_seats: seats ? parseInt(seats) : null,
  };
  $("#status").textContent = "Finding matches…";
  try {
    const out = await api("/api/recommend", { user_id: USER_ID, preferences: prefs, k: 10 });
    lastRecId = out.recommendation_id;
    render(out);
  } catch (err) {
    $("#status").textContent = "Couldn't get recommendations: " + err.message;
  }
});

function render(out) {
  const list = $("#list"); list.innerHTML = "";
  if (!out.results.length) {
    $("#status").textContent = "No vehicles pass your filters. Try raising the budget or relaxing strict options.";
    return;
  }
  const personal = out.used_implicit_profile ? " · personalised using your activity" : "";
  $("#status").textContent = `${out.results.length} matches from ${out.candidates_after_filters} vehicles${personal}`;

  out.results.forEach((r) => {
    const v = r.vehicle;
    const li = document.createElement("li"); li.className = "card";
    const eff = v.fuel === "electric" ? `${v.range_km} km range` : `${v.mileage_kmpl} ${v.fuel === "cng" ? "km/kg" : "km/l"}`;
    li.innerHTML = `
      <div class="card-head">
        <div>
          <div class="rank">#${r.rank}</div>
          <div class="title">${v.make} ${v.model} <span class="meta">${v.variant}</span></div>
          <div class="meta">₹${v.price_lakh.toFixed(1)} L · ${pretty(v.body_type)} · ${pretty(v.fuel)} ·
            ${v.transmission.toUpperCase()} · ${v.seats} seats · ${eff}</div>
        </div>
        <div class="match"><b>${r.match_pct}%</b><small>match</small></div>
      </div>
      <div class="bar"><span style="width:${Math.min(100, r.match_pct)}%"></span></div>
      <ul class="why">
        ${r.reasons.map((x) => `<li>${x}</li>`).join("")}
        ${r.warnings.map((x) => `<li class="warn">${x}</li>`).join("")}
      </ul>
      <div class="actions">
        <button data-a="save">♡ Save</button>
        <button data-a="compare">⇄ Compare</button>
        <button data-a="test_drive" class="cta">Book test drive</button>
        <span class="spacer"></span>
        <button data-a="up" title="Good recommendation">👍</button>
        <button data-a="down" title="Not relevant">👎</button>
      </div>`;
    // Any engagement with a card counts as one click on the recommendation (for CTR).
    let clicked = false;
    const clickOnce = () => { if (!clicked) { clicked = true; logEvent("click", v.id, r.rank); } };
    li.querySelector(".card-head").onclick = () => { clickOnce(); toast("Opened details (click logged)"); };
    li.querySelectorAll(".actions button").forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a !== "up" && a !== "down") clickOnce();
        if (a === "up" || a === "down") {
          logEvent("feedback", v.id, r.rank, a === "up" ? 1 : 0);
          toast("Thanks for the feedback");
        } else if (a === "test_drive") {
          testDriveTarget = { vehicleId: v.id, rank: r.rank, recId: lastRecId, btn: b };
          $("#tdDate").min = new Date().toISOString().split("T")[0];
          $("#testDriveDlg").showModal();
          return;
        } else if (a === "compare") {
          const idx = compareList.findIndex((c) => c.vehicle.id === v.id);
          if (idx !== -1) {
            compareList.splice(idx, 1);
            b.textContent = "⇄ Compare"; b.classList.remove("added");
          } else if (compareList.length < 3) {
            compareList.push({ vehicle: v, match_pct: r.match_pct, rank: r.rank });
            logEvent("compare", v.id, r.rank);
            b.textContent = "✓ Added"; b.classList.add("added");
          } else {
            toast("Remove a car first to add another");
          }
          updateCompareBar();
          return;
        } else {
          logEvent(a, v.id, r.rank);
          toast(`${a[0].toUpperCase() + a.slice(1)}d`);
        }
        b.classList.add("done"); b.disabled = true;
      };
    });
    list.appendChild(li);
  });
}

function updateCompareBar() {
  const n = compareList.length;
  $("#compareBar").hidden = n === 0;
  $("#compareBarLabel").textContent = n === 1 ? "1 car selected" : `Comparing ${n} cars`;
}

const FEATURE_LABELS = {
  sunroof: "Sunroof", six_airbags: "6 airbags", adas: "ADAS",
  android_auto: "Android Auto / CarPlay", auto_climate: "Auto climate",
  ventilated_seats: "Ventilated seats", camera_360: "360° camera",
  cruise_control: "Cruise control", wireless_charging: "Wireless charging",
  connected_car: "Connected car",
};

function renderCompareDialog() {
  const items = compareList;
  const v = (i) => items[i].vehicle;

  function numRow(label, getter, lowerBetter = false) {
    const vals = items.map(getter);
    const nums = vals.map(Number).filter((n) => !isNaN(n));
    const best = nums.length ? (lowerBetter ? Math.min(...nums) : Math.max(...nums)) : null;
    const cells = vals.map((val) => {
      const isBest = best !== null && !isNaN(Number(val)) && Number(val) === best;
      const display = val == null ? "—" : val;
      return `<td>${isBest ? `<span class="cmp-best">${display}</span>` : display}</td>`;
    }).join("");
    return `<tr><td class="row-hdr">${label}</td>${cells}</tr>`;
  }

  function textRow(label, getter) {
    return `<tr><td class="row-hdr">${label}</td>${items.map((item) =>
      `<td>${getter(item)}</td>`).join("")}</tr>`;
  }

  const headers = items.map((item) =>
    `<th>${item.vehicle.make} ${item.vehicle.model}<br><small style="color:var(--muted);font-weight:400">${item.vehicle.variant}</small></th>`
  ).join("");

  const featureRows = Object.entries(FEATURE_LABELS).map(([key, label]) =>
    `<tr><td class="row-hdr">${label}</td>${items.map((item) =>
      `<td style="color:${(item.vehicle.features || []).includes(key) ? "var(--accent)" : "var(--muted)"}">${
        (item.vehicle.features || []).includes(key) ? "✓" : "—"}</td>`
    ).join("")}</tr>`
  ).join("");

  $("#compareBody").innerHTML = `
    <table class="cmp-table">
      <thead><tr><th class="row-hdr"></th>${headers}</tr></thead>
      <tbody>
        ${numRow("Match %", (item) => item.match_pct)}
        ${numRow("Price (₹ lakh)", (item) => item.vehicle.price_lakh?.toFixed(1), true)}
        ${textRow("Body type", (item) => pretty(item.vehicle.body_type))}
        ${textRow("Fuel", (item) => pretty(item.vehicle.fuel))}
        ${textRow("Transmission", (item) => item.vehicle.transmission?.toUpperCase())}
        ${numRow("Seats", (item) => item.vehicle.seats)}
        ${numRow("Power (bhp)", (item) => item.vehicle.power_bhp)}
        ${numRow("Boot (litres)", (item) => item.vehicle.boot_litres)}
        ${numRow("Safety rating", (item) => item.vehicle.safety_rating)}
        ${textRow("Efficiency", (item) => item.vehicle.fuel === "electric"
          ? `${item.vehicle.range_km} km range`
          : `${item.vehicle.mileage_kmpl} ${item.vehicle.fuel === "cng" ? "km/kg" : "km/l"}`)}
        ${featureRows}
      </tbody>
    </table>`;
  $("#compareDlg").showModal();
}

$("#compareViewBtn").onclick = () => {
  if (compareList.length < 2) { toast("Add at least 2 cars to compare"); return; }
  try {
    const dlg = $("#compareDlg");
    if (dlg.open) dlg.close();
    renderCompareDialog();
  } catch (err) {
    toast("Compare failed: " + err.message);
    console.error("renderCompareDialog error:", err);
  }
};

$("#compareClearBtn").onclick = () => {
  compareList = [];
  updateCompareBar();
  document.querySelectorAll(".actions button[data-a=compare]").forEach((b) => {
    b.textContent = "⇄ Compare"; b.classList.remove("added");
  });
};

$("#bookingsBtn").onclick = async () => {
  const bookings = await api("/api/bookings/test-drive");
  const body = $("#bookingsBody");
  if (!bookings.length) {
    body.innerHTML = `<p class="meta">No bookings yet.</p>`;
  } else {
    body.innerHTML = `
      <table class="bookings-table">
        <thead><tr>
          <th class="td-center">Test drive taken</th>
          <th>Vehicle</th><th>Name</th><th>Phone</th><th>City</th><th>Branch</th>
          <th>Preferred date</th><th>Sales officer</th><th>Booked at</th>
        </tr></thead>
        <tbody>${bookings.map((b) => `
          <tr data-bid="${b.id}">
            <td class="td-center tick-cell">
              <button class="tick-btn${b.completed ? " ticked" : ""}" data-bid="${b.id}" title="Toggle">
                ${b.completed ? "✓" : "○"}
              </button>
              <button class="save-tick-btn" data-bid="${b.id}" hidden>Save</button>
            </td>
            <td>${b.vehicle_id}</td>
            <td>${b.name}</td>
            <td>${b.phone}</td>
            <td>${b.city}</td>
            <td>${b.branch || "—"}</td>
            <td>${b.preferred_date}</td>
            <td><input class="td-input td-text" type="text" value="${b.sales_officer || ""}" placeholder="Enter name" data-field="sales_officer" /></td>
            <td>${new Date(b.ts * 1000).toLocaleString()}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;

    body.querySelectorAll(".tick-btn").forEach((btn) => {
      btn.onclick = () => {
        const nowTicked = !btn.classList.contains("ticked");
        btn.classList.toggle("ticked", nowTicked);
        btn.textContent = nowTicked ? "✓" : "○";
        const saveBtn = btn.closest(".tick-cell").querySelector(".save-tick-btn");
        saveBtn.hidden = false;
      };
    });

    body.querySelectorAll(".save-tick-btn").forEach((saveBtn) => {
      saveBtn.onclick = async () => {
        const tickBtn = saveBtn.closest(".tick-cell").querySelector(".tick-btn");
        const completed = tickBtn.classList.contains("ticked");
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        try {
          await api(`/api/bookings/test-drive/${saveBtn.dataset.bid}`, { completed }, "PATCH");
          saveBtn.hidden = true;
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
          toast(completed ? "Test drive marked as taken" : "Marked as not taken");
        } catch (err) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
          toast("Save failed: " + err.message);
        }
      };
    });

    body.querySelectorAll(".td-input").forEach((input) => {
      input.onchange = async () => {
        const row = input.closest("tr[data-bid]");
        try {
          await api(`/api/bookings/test-drive/${row.dataset.bid}`, { [input.dataset.field]: input.value || null }, "PATCH");
          toast("Saved");
        } catch (err) {
          toast("Save failed: " + err.message);
        }
      };
    });
  }
  $("#bookingsDlg").showModal();
};

$("#metricsBtn").onclick = async () => {
  const m = await api("/api/metrics");
  const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  $("#metricsBody").innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${pct(m.ctr)}</b><span>Recommendation CTR (${m.recommendation_clicks}/${m.impressions})</span></div>
      <div class="kpi"><b>${pct(m.test_drive_rate)}</b><span>Users who booked a test drive (${m.test_drive_bookings} bookings)</span></div>
      <div class="kpi"><b>${pct(m.lead_conversion_rate)}</b><span>Lead conversion (${m.purchases} purchases)</span></div>
      <div class="kpi"><b>${pct(m.csat)}</b><span>Satisfaction 👍 (${m.feedback_responses} responses)</span></div>
    </div>
    <p class="meta">CTR by position: ${m.ctr_by_position.map((p) => `#${p.position} ${pct(p.ctr)}`).join(" · ") || "no data yet"}</p>`;
  $("#metricsDlg").showModal();
};

$("#tdCancel").onclick = () => {
  $("#testDriveDlg").close();
  testDriveTarget = null;
};

$("#testDriveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!testDriveTarget) return;
  const { vehicleId, recId, btn } = testDriveTarget;
  try {
    await api("/api/bookings/test-drive", {
      user_id: USER_ID,
      vehicle_id: vehicleId,
      name: $("#tdName").value,
      phone: $("#tdPhone").value,
      city: $("#tdCity").value,
      branch: $("#tdBranch")?.value ?? "",
      preferred_date: $("#tdDate").value,
      sales_officer: $("#tdSalesOfficer")?.value ?? "",
      recommendation_id: recId,
    });
    toast("Test drive booked!");
    btn.classList.add("done"); btn.disabled = true;
    $("#testDriveDlg").close();
    $("#testDriveForm").reset();
    testDriveTarget = null;
  } catch (err) {
    toast("Booking failed: " + err.message);
  }
});

init();
