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

async function api(path, body) {
  const res = await fetch(path, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : undefined);
  if (!res.ok) throw new Error((await res.json()).detail?.[0]?.msg || res.statusText);
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

$("#prefs").addEventListener("submit", async (e) => {
  e.preventDefault();
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

$("#bookingsBtn").onclick = async () => {
  const bookings = await api("/api/bookings/test-drive");
  if (!bookings.length) {
    $("#bookingsBody").innerHTML = `<p class="meta">No bookings yet.</p>`;
  } else {
    $("#bookingsBody").innerHTML = `
      <table class="bookings-table">
        <thead><tr><th>Vehicle ID</th><th>Name</th><th>Phone</th><th>City</th><th>Date</th><th>Booked at</th></tr></thead>
        <tbody>${bookings.map((b) => `
          <tr>
            <td>${b.vehicle_id}</td>
            <td>${b.name}</td>
            <td>${b.phone}</td>
            <td>${b.city}</td>
            <td>${b.preferred_date}</td>
            <td>${new Date(b.ts * 1000).toLocaleString()}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
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
      preferred_date: $("#tdDate").value,
      recommendation_id: recId,
    });
    toast("Test drive booked!");
    btn.classList.add("done"); btn.disabled = true;
    $("#testDriveDlg").close();
    $("#testDriveForm").reset();
    testDriveTarget = null;
  } catch (err) {
    toast("Booking failed — try again");
  }
});

init();
