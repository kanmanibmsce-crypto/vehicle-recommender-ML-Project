// DriveMatch Pro — API-connected frontend
// Talks to /api/recommend, /api/events, /api/bookings/test-drive, /api/metrics

const $ = (s) => document.querySelector(s);

/* ── User identity ────────────────────────────────────────────────────── */
function getUserId() {
  let id = null;
  try { id = localStorage.getItem("dm_user"); } catch (_) {}
  if (!id) { id = "u_" + Math.random().toString(36).slice(2, 10); try { localStorage.setItem("dm_user", id); } catch (_) {} }
  return id;
}
const USER_ID = getUserId();

/* ── State ────────────────────────────────────────────────────────────── */
let lastRecId     = null;
let currentResults = [];
let bookingTarget  = null;   // { vehicleId, vehicleName, rank }
let compareList    = [];     // up to 3 items: { vehicle, match_pct, rank }
let selectedFuels  = [];     // empty = All
let selectedBodies = [];
let selectedTrans  = "any";
let funnelChart    = null;

/* ── Local booking cache (survives Vercel cross-instance SQLite gaps) ─── */
function getLocalBookings() {
  try { return JSON.parse(localStorage.getItem("dm_bookings") || "[]"); } catch (_) { return []; }
}
function saveLocalBooking(b) {
  try {
    const list = getLocalBookings();
    list.unshift(b);
    localStorage.setItem("dm_bookings", JSON.stringify(list.slice(0, 200)));
  } catch (_) {}
}
let posChart       = null;

const PRETTY = {
  hatchback:"Hatchback", sedan:"Sedan", micro_suv:"Micro SUV", compact_suv:"Compact SUV",
  midsize_suv:"Mid-size SUV", large_suv:"Large SUV", mpv:"MPV / 7-seater",
  petrol:"Petrol", diesel:"Diesel", cng:"CNG", hybrid:"Hybrid", electric:"Electric",
  any:"Any", manual:"Manual", automatic:"Automatic",
  safety:"Safety", performance:"Performance", space:"Space", efficiency:"Efficiency",
};
const pretty = (k) => PRETTY[k] || (k || "").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

const FUEL_COLORS = {
  electric: "from-blue-400 to-emerald-500",
  hybrid:   "from-emerald-400 to-teal-500",
  petrol:   "from-orange-400 to-amber-500",
  diesel:   "from-slate-400 to-slate-600",
  cng:      "from-teal-400 to-cyan-500",
};

const FUEL_EMOJI  = { electric:"⚡", hybrid:"🌿", petrol:"⛽", diesel:"🛢", cng:"🟢" };

const BODY_IMAGES = {
  hatchback:   "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=600&auto=format&fit=crop&q=80",
  micro_suv:   "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=600&auto=format&fit=crop&q=80",
  compact_suv: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600&auto=format&fit=crop&q=80",
  sedan:       "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=600&auto=format&fit=crop&q=80",
  midsize_suv: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&auto=format&fit=crop&q=80",
  large_suv:   "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&auto=format&fit=crop&q=80",
  mpv:         "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=600&auto=format&fit=crop&q=80",
};
const ELECTRIC_IMG = "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=600&auto=format&fit=crop&q=80";

const TOYOTA_IMAGES = {
  "glanza":                "/static/toyota_vehicles/glanza.webp",
  "fortuner":              "/static/toyota_vehicles/fortuner.webp",
  "fortuner legender":     "/static/toyota_vehicles/legender.webp",
  "innova hycross":        "/static/toyota_vehicles/hycross.webp",
  "innova crysta":         "/static/toyota_vehicles/crysta.jpg",
  "urban cruiser hyryder": "/static/toyota_vehicles/hyrider.webp",
  "hyrider hybrid":        "/static/toyota_vehicles/hyrider.webp",
  "hyrider cng":           "/static/toyota_vehicles/hyrider.webp",
  "hyryder neo drive":     "/static/toyota_vehicles/hyrider.webp",
  "camry white":           "/static/toyota_vehicles/camry2.webp",
  "camry(other color)":    "/static/toyota_vehicles/camry.jpg",
  "hilux":                 "/static/toyota_vehicles/hilux.avif",
  "hilux white":           "/static/toyota_vehicles/hilux.avif",
  "vellfire":              "/static/toyota_vehicles/new-vellfire-white-2.webp",
  "rumion":                "/static/toyota_vehicles/rumion.avif",
  "rumion-neo drive":      "/static/toyota_vehicles/rumion.avif",
  "urban cruiser taisor (white board)":  "/static/toyota_vehicles/taisor.webp?v=2",
  "urban cruiser taisor (yellow board)": "/static/toyota_vehicles/taisor.webp?v=2",
  "land cruiser 300":      "/static/toyota_vehicles/LC.webp",
  "land cruiser":          "/static/toyota_vehicles/LC.webp",
  "urban cruiser ebella":  "/static/toyota_vehicles/ebella.avif",
};

let featuresMap = {};

/* ── Indian quick-profile presets ─────────────────────────────────────── */
const LEAD_PROFILES = {
  kumar: {
    name: "Raj & Priya Kumar",
    sub:  "Family looking for 7-seat hybrid/EV SUV",
    budgetMin: 20, budgetMax: 28,
    fuels: ["hybrid","electric"], bodies: ["midsize_suv","large_suv","mpv"],
    trans: "automatic", seats: "7",
    features: ["six_airbags","adas","camera_360"],
    priorities: ["safety","space"],
  },
  mehta: {
    name: "Dr. Mehta",
    sub:  "Premium electric sedan, safety & performance",
    budgetMin: 30, budgetMax: 55,
    fuels: ["electric","hybrid"], bodies: ["sedan","compact_suv"],
    trans: "automatic", seats: "",
    features: ["sunroof","adas","ventilated_seats","wireless_charging"],
    priorities: ["safety","performance"],
  },
  ananya: {
    name: "Ananya Sharma",
    sub:  "First car — city commute, fuel efficiency",
    budgetMin: 8, budgetMax: 14,
    fuels: ["petrol","electric"], bodies: ["hatchback","compact_suv"],
    trans: "any", seats: "",
    features: ["android_auto","auto_climate"],
    priorities: ["efficiency"],
  },
};

/* ── Auth ─────────────────────────────────────────────────────────────── */
function getToken() { try { return localStorage.getItem("dm_token"); } catch (_) { return null; } }
function setToken(t) { try { localStorage.setItem("dm_token", t); } catch (_) {} }
function clearToken() { try { localStorage.removeItem("dm_token"); localStorage.removeItem("dm_auth_user"); } catch (_) {} }
function getAuthUser() { try { return localStorage.getItem("dm_auth_user") || "admin"; } catch (_) { return "admin"; } }
function setAuthUser(u) { try { localStorage.setItem("dm_auth_user", u); } catch (_) {} }

function showLoginOverlay() {
  $("#login-overlay").classList.remove("hidden");
  $("#app-shell").classList.add("hidden");
}
function hideLoginOverlay() {
  $("#login-overlay").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
}

function togglePwdVisibility() {
  const inp = $("#login-password"), icon = $("#pwd-eye");
  if (inp.type === "password") { inp.type = "text"; icon.classList.replace("fa-eye","fa-eye-slash"); }
  else { inp.type = "password"; icon.classList.replace("fa-eye-slash","fa-eye"); }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = $("#login-btn"), btnText = $("#login-btn-text"), spinner = $("#login-spinner");
  const errBox = $("#login-error");
  errBox.classList.add("hidden");
  btn.disabled = true; btnText.textContent = "Signing in…"; spinner.classList.remove("hidden");
  try {
    const data = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("#login-username").value.trim(), password: $("#login-password").value }),
    }).then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || "Invalid credentials")));
    setToken(data.access_token);
    setAuthUser(data.username);
    hideLoginOverlay();
    initApp();
  } catch (err) {
    errBox.textContent = typeof err === "string" ? err : "Invalid username or password";
    errBox.classList.remove("hidden");
  } finally {
    btn.disabled = false; btnText.textContent = "Sign In"; spinner.classList.add("hidden");
  }
}

function logout() {
  clearToken();
  showLoginOverlay();
  $("#login-username").value = "";
  $("#login-password").value = "";
  $("#login-error").classList.add("hidden");
}

/* ── API helper ───────────────────────────────────────────────────────── */
async function api(path, body, method) {
  const m = method || (body ? "POST" : "GET");
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, body !== undefined && body !== null
    ? { method: m, headers, body: JSON.stringify(body) }
    : { headers }
  );
  if (res.status === 401) { logout(); throw new Error("Session expired — please sign in again"); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const msg = Array.isArray(d.detail)
      ? d.detail.map(e => `${e.loc?.slice(-1)[0] ?? ""}: ${e.msg}`).join("; ")
      : (d.detail || res.statusText);
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

/* ── Toast ────────────────────────────────────────────────────────────── */
function showToast(msg, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  const dot = type === "success" ? "bg-emerald-500" : type === "error" ? "bg-red-500" : "bg-brand-600";
  toast.className = "bg-white p-3.5 rounded-xl shadow-dropdown border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-800 pointer-events-auto transform transition-all duration-300 -translate-y-2 opacity-0";
  toast.innerHTML = `<span class="w-2 h-2 rounded-full ${dot} shrink-0"></span><span>${msg}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove("-translate-y-2","opacity-0"));
  setTimeout(() => { toast.classList.add("opacity-0"); setTimeout(() => toast.remove(), 300); }, 3000);
}

/* ── Tab switching ────────────────────────────────────────────────────── */
const TABS = ["recommender","leads","fleet","schedule","analytics"];

function switchTab(tabId) {
  TABS.forEach(t => {
    const sec = $(`#tab-${t}`), btn = $(`#nav-${t}`);
    if (t === tabId) {
      sec.classList.remove("hidden");
      btn.className = "nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition bg-brand-50 text-brand-600 border border-brand-100";
    } else {
      sec.classList.add("hidden");
      btn.className = "nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition";
    }
  });
  if (tabId === "analytics")  loadAnalytics();
  if (tabId === "schedule")   loadSchedule();
  if (tabId === "leads")      loadLeadInbox();
  if (tabId === "fleet")      loadFleet();
}

/* ── Budget display ───────────────────────────────────────────────────── */
function updateBudgetDisplay() {
  const mn = parseFloat($("#input-budget-min").value || 0);
  const mx = parseFloat($("#input-budget-max").value || 0);
  $("#budget-display").textContent = `₹${mn} – ₹${mx} L`;
}

/* ── Fuel buttons ─────────────────────────────────────────────────────── */
function toggleFuel(fuel, btn) {
  if (fuel === "all") {
    selectedFuels = [];
    document.querySelectorAll(".fuel-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    return;
  }
  document.querySelector(".fuel-btn[data-fuel='all']").classList.remove("active");
  if (selectedFuels.includes(fuel)) {
    selectedFuels = selectedFuels.filter(f => f !== fuel);
    btn.classList.remove("active");
  } else {
    selectedFuels.push(fuel);
    btn.classList.add("active");
  }
  if (!selectedFuels.length) {
    document.querySelector(".fuel-btn[data-fuel='all']").classList.add("active");
  }
}

/* ── Body type chips ──────────────────────────────────────────────────── */
function buildBodyChips(bodyTypes) {
  const el = $("#body-type-chips");
  bodyTypes.forEach(bt => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.body = bt;
    b.textContent = pretty(bt);
    b.className = "body-btn px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs hover:bg-slate-100 transition";
    b.onclick = () => {
      if (selectedBodies.includes(bt)) {
        selectedBodies = selectedBodies.filter(x => x !== bt);
        b.classList.remove("active");
      } else {
        selectedBodies.push(bt);
        b.classList.add("active");
      }
    };
    el.appendChild(b);
  });
}

/* ── Transmission ─────────────────────────────────────────────────────── */
function setTrans(t, btn) {
  selectedTrans = t;
  document.querySelectorAll(".trans-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

/* ── Feature checkboxes ───────────────────────────────────────────────── */
function buildFeatureChecks(features) {
  const el = $("#feature-checks");
  el.innerHTML = "";
  features.forEach(f => {
    const label = document.createElement("label");
    label.className = "feat-row flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-feat="${f.key}" class="rounded text-brand-600 focus:ring-0">
                       <span class="font-semibold text-slate-700">${f.label}</span>`;
    el.appendChild(label);
  });
}

/* ── Priority checkboxes ──────────────────────────────────────────────── */
function buildPriorityChecks(priorities) {
  const el = $("#priority-checks");
  el.innerHTML = "";
  const icons = { safety:"🛡", performance:"⚡", space:"📦", efficiency:"🍃" };
  priorities.forEach(p => {
    const label = document.createElement("label");
    label.className = "feat-row flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-prio="${p}" class="rounded text-brand-600 focus:ring-0">
                       <span class="font-semibold text-slate-700">${icons[p] || ""} ${pretty(p)}</span>`;
    el.appendChild(label);
  });
}

/* ── Read current preferences from UI ────────────────────────────────── */
function getPreferences() {
  const feats = [...document.querySelectorAll('[data-feat]:checked')].map(x => x.dataset.feat);
  const prios = [...document.querySelectorAll('[data-prio]:checked')].map(x => x.dataset.prio);
  const seats = $("#input-seats").value;
  return {
    budget_min: parseFloat($("#input-budget-min").value || 0),
    budget_max: parseFloat($("#input-budget-max").value || 10),
    body_types: [...selectedBodies],
    fuels: [...selectedFuels],
    fuel_strict: $("#fuel-strict").checked,
    transmission: selectedTrans,
    transmission_strict: $("#trans-strict").checked,
    must_have_features: feats,
    priorities: prios,
    min_seats: seats ? parseInt(seats) : null,
  };
}

/* ── Run AI recommendation ────────────────────────────────────────────── */
async function runAIMatch() {
  const icon = $("#ai-spin-icon");
  icon.classList.add("animate-spin");
  $("#results-meta").textContent = "Calculating AI matches…";
  $("#parsed-tags-row").classList.add("hidden");
  $("#parsed-tags-row").innerHTML = "";
  try {
    const prefs = getPreferences();
    const out = await api("/api/recommend", { user_id: USER_ID, preferences: prefs, k: 30 });
    lastRecId = out.recommendation_id;
    currentResults = out.results;
    renderVehicleCards(out);
  } catch (err) {
    showToast("Recommendation failed: " + err.message, "error");
    $("#results-meta").textContent = "Error — check console";
  } finally {
    icon.classList.remove("animate-spin");
  }
}

/* ── NLP search ───────────────────────────────────────────────────────── */
async function runNLPSearch() {
  const q = $("#nlp-search").value.trim();
  if (!q) { runAIMatch(); return; }
  const icon = $("#ai-spin-icon");
  icon.classList.add("animate-spin");
  switchTab("recommender");
  $("#results-meta").textContent = "Searching…";
  try {
    const out = await api("/api/search", { user_id: USER_ID, q, k: 30 });
    lastRecId = out.recommendation_id;
    currentResults = out.results;
    if (out.parsed_tags?.length) {
      const row = $("#parsed-tags-row");
      row.innerHTML = out.parsed_tags.map(t =>
        `<span class="bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-xl text-[11px] font-bold">${t}</span>`
      ).join("");
      row.classList.remove("hidden");
    }
    renderVehicleCards(out);
    showToast(`Search complete — "${q}"`, "success");
  } catch (err) {
    showToast("Search failed: " + err.message, "error");
    $("#results-meta").textContent = "Search error";
  } finally {
    icon.classList.remove("animate-spin");
  }
}

$("#nlp-search").addEventListener("keydown", e => { if (e.key === "Enter") runNLPSearch(); });

/* ── Render vehicle cards (Toyota-style with images + features list) ─── */
function renderVehicleCards(out) {
  const container = $("#vehicle-cards-container");
  container.innerHTML = "";

  if (!out.results.length) {
    $("#results-meta").textContent = `No vehicles pass your filters (${out.candidates_after_filters} checked).`;
    container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center text-slate-400 text-sm">
      <i class="fa-solid fa-circle-xmark text-4xl mb-3 text-red-300 block"></i>
      No matches. Try raising the budget or relaxing strict options.
    </div>`;
    return;
  }

  // Normalise colour-variant model names so e.g. "Taisor (White Board)" and
  // "Taisor (Yellow Board)" collapse to the same dedup key.
  function modelKey(model) {
    return model.toLowerCase()
      .replace(/\s*\(white board\)/g, "").replace(/\s*\(yellow board\)/g, "")
      .replace(/\s*\(other color\)/g, "").replace(/\s+white$/g, "")
      .trim();
  }

  // Show up to MAX_PER_MODEL variants per model so users can compare
  // trim levels (e.g. Glanza S / G / V at different price points).
  // Cap at 3 to avoid flooding the list with 13 Glanza variants.
  const MAX_PER_MODEL = 3;
  const seenCount = new Map();
  const dedupedResults = out.results.filter(r => {
    const key = modelKey(r.vehicle.model);
    const n = seenCount.get(key) || 0;
    if (n >= MAX_PER_MODEL) return false;
    seenCount.set(key, n + 1);
    return true;
  });

  const personal = out.used_implicit_profile ? " · personalised using your activity" : "";
  const limitedNote = dedupedResults.length < 5 && out.candidates_after_filters > 0
    ? " · try widening your budget or removing feature filters to see more"
    : "";
  $("#results-meta").textContent = `${dedupedResults.length} matches from ${out.candidates_after_filters} vehicles${personal}${limitedNote}`;

  dedupedResults.forEach((r, idx) => {
    const v = r.vehicle;
    const isTop = idx === 0;
    const toyotaImg = v.make === "Toyota" ? TOYOTA_IMAGES[v.model.toLowerCase().trim()] : null;
    const imgUrl = toyotaImg || (v.fuel === "electric" ? ELECTRIC_IMG : (BODY_IMAGES[v.body_type] || BODY_IMAGES.compact_suv));
    const eff = v.fuel === "electric" ? `${v.range_km ?? "—"} km range` : `${v.mileage_kmpl ?? "—"} km/l`;

    const reasonsHtml = r.reasons.map(x =>
      `<span class="bg-brand-50 text-brand-700 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-brand-100 flex items-center gap-1 shrink-0">
         <i class="fa-solid fa-check text-brand-600 text-[9px]"></i>${x}
       </span>`
    ).join("");

    const warningsHtml = r.warnings.map(x =>
      `<span class="bg-amber-50 text-amber-800 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 shrink-0">
         <i class="fa-solid fa-triangle-exclamation text-amber-500 text-[9px]"></i>${x}
       </span>`
    ).join("");

    const topFeats = (v.features || []).slice(0, 4);
    const featuresHtml = topFeats.length
      ? `<ul class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-3">
          ${topFeats.map(f => `<li class="flex items-center gap-1.5 text-slate-600">
            <i class="fa-solid fa-circle-check text-[9px] text-brand-500 shrink-0"></i>
            ${featuresMap[f] || pretty(f)}</li>`).join("")}
         </ul>`
      : "";

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl border ${isTop ? "border-brand-500 ring-1 ring-brand-500/20 shadow-md" : "border-slate-200 shadow-card"} p-5 transition-all hover:shadow-dropdown`;
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-5">
        <!-- Car photo -->
        <div class="sm:w-48 h-36 rounded-xl overflow-hidden relative shrink-0 bg-slate-100">
          <img src="${imgUrl}" alt="${v.make} ${v.model}" class="w-full h-full object-cover"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="absolute inset-0 bg-gradient-to-br ${FUEL_COLORS[v.fuel]||'from-slate-300 to-slate-400'} items-center justify-center text-4xl hidden">
            ${FUEL_EMOJI[v.fuel] || "🚗"}
          </div>
          <span class="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-sm text-white text-[9px] font-extrabold px-2 py-0.5 rounded-md">
            ${FUEL_EMOJI[v.fuel] || ""} ${pretty(v.fuel)}
          </span>
          ${isTop ? '<span class="absolute bottom-2 right-2 bg-brand-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md">Top Match</span>' : ""}
        </div>

        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-extrabold text-slate-900 text-base">${v.make} ${v.model}</h4>
                  <span class="text-xs font-semibold text-slate-400">${v.variant}</span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">${pretty(v.body_type)} · ${v.transmission?.toUpperCase()} · ${v.seats} seats · ${eff}</p>
              </div>
              <div class="${isTop ? "bg-brand-600 match-badge-pulse" : "bg-slate-800"} text-white px-3 py-1 rounded-xl text-center shadow-sm shrink-0">
                <span class="text-xs font-black">${r.match_pct}%</span>
                <span class="text-[8px] block uppercase font-bold ${isTop ? "text-blue-200" : "text-slate-400"}">AI Match</span>
              </div>
            </div>

            <!-- Reason & warning pills -->
            <div class="flex flex-wrap gap-1.5 mt-3">
              ${reasonsHtml}${warningsHtml}
            </div>

            <!-- Features list (Toyota-style) -->
            ${featuresHtml}
          </div>

          <!-- Price & action bar -->
          <div class="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 flex-wrap gap-2">
            <div>
              <span class="text-lg font-black text-slate-900">₹${v.price_lakh?.toFixed(1)} L</span>
              <span class="text-xs text-slate-400 font-semibold"> · ${v.power_bhp} bhp · Safety ${v.safety_rating}★ · ${v.seats} seats</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button data-a="save"    data-vid="${v.id}" data-rank="${r.rank}" class="action-btn border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold transition">♡ Save</button>
              <button data-a="compare" data-vid="${v.id}" data-rank="${r.rank}" class="action-btn border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold transition">⇄ Compare</button>
              <button data-a="test_drive" data-vid="${v.id}" data-rank="${r.rank}" data-vname="${v.make} ${v.model} ${v.variant}"
                class="action-btn bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                <i class="fa-solid fa-key text-[10px]"></i> Schedule Drive
              </button>
              <button data-a="up"   data-vid="${v.id}" data-rank="${r.rank}" title="Good match" class="action-btn border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-xl text-xs hover:bg-slate-100 transition">👍</button>
              <button data-a="down" data-vid="${v.id}" data-rank="${r.rank}" title="Not relevant" class="action-btn border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-xl text-xs hover:bg-slate-100 transition">👎</button>
            </div>
          </div>
        </div>
      </div>`;

    // Wire action buttons
    card.querySelectorAll(".action-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const a    = btn.dataset.a;
        const vid  = parseInt(btn.dataset.vid);
        const rank = parseInt(btn.dataset.rank);
        if (a === "up" || a === "down") {
          logEvent("feedback", vid, rank, a === "up" ? 1 : 0);
          showToast("Thanks for the feedback", "success");
          return;
        }
        logEvent("click", vid, rank);
        if (a === "test_drive") {
          openBookingModal(vid, btn.dataset.vname, rank);
        } else if (a === "compare") {
          const inList = compareList.findIndex(c => c.vehicle.id === vid);
          const resultItem = out.results.find(x => x.vehicle.id === vid);
          if (inList !== -1) {
            compareList.splice(inList, 1);
            btn.textContent = "⇄ Compare";
            btn.classList.remove("bg-brand-50","text-brand-700","border-brand-200");
          } else if (compareList.length < 3 && resultItem) {
            compareList.push(resultItem);
            logEvent("compare", vid, rank);
            btn.textContent = "✓ Added";
            btn.classList.add("bg-brand-50","text-brand-700","border-brand-200");
          } else {
            showToast("Remove a car first (max 3)", "info");
            return;
          }
          updateCompareCount();
        } else if (a === "save") {
          logEvent("save", vid, rank);
          btn.textContent = "♥ Saved";
          btn.disabled = true;
          btn.classList.add("opacity-60");
          showToast("Vehicle saved!", "success");
        }
      });
    });

    container.appendChild(card);
  });
}

/* ── Compare ──────────────────────────────────────────────────────────── */
function updateCompareCount() {
  $("#compare-count").textContent = compareList.length;
}

function openCompareModal() {
  if (compareList.length < 2) { showToast("Select at least 2 cars using ⇄ Compare", "info"); return; }
  const FEAT_LABELS = {
    sunroof:"Sunroof", six_airbags:"6 Airbags", adas:"ADAS", android_auto:"Android Auto",
    auto_climate:"Auto Climate", ventilated_seats:"Ventilated Seats", camera_360:"360° Camera",
    cruise_control:"Cruise Control", wireless_charging:"Wireless Charging", connected_car:"Connected Car",
  };
  const items = compareList;

  const headers = items.map(r =>
    `<th class="text-center p-3 border-b-2 border-brand-200 bg-brand-50 font-extrabold text-slate-900">
       ${r.vehicle.make} ${r.vehicle.model}<br>
       <small class="font-normal text-slate-500">${r.vehicle.variant}</small>
     </th>`
  ).join("");

  function row(label, getter, lowerBetter = false) {
    const vals = items.map(getter);
    const nums = vals.map(Number).filter(n => !isNaN(n));
    const best = nums.length ? (lowerBetter ? Math.min(...nums) : Math.max(...nums)) : null;
    return `<tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="p-3 text-slate-500 font-semibold text-left whitespace-nowrap">${label}</td>
      ${vals.map((v, i) => {
        const isBest = best !== null && !isNaN(Number(v)) && Number(v) === best;
        return `<td class="p-3 text-center font-bold ${isBest ? "text-emerald-600" : "text-slate-800"}">${v == null ? "—" : v}</td>`;
      }).join("")}
    </tr>`;
  }
  function textRow(label, getter) {
    return `<tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="p-3 text-slate-500 font-semibold text-left">${label}</td>
      ${items.map(r => `<td class="p-3 text-center font-semibold text-slate-800">${getter(r)}</td>`).join("")}
    </tr>`;
  }
  const featRows = Object.entries(FEAT_LABELS).map(([k, l]) =>
    `<tr class="border-b border-slate-100 hover:bg-slate-50">
       <td class="p-3 text-slate-500 font-semibold text-left">${l}</td>
       ${items.map(r => `<td class="p-3 text-center">${(r.vehicle.features||[]).includes(k) ? '<span class="text-emerald-600 font-bold">✓</span>' : '<span class="text-slate-300">—</span>'}</td>`).join("")}
     </tr>`
  ).join("");

  $("#compare-grid").innerHTML = `
    <table class="w-full text-xs border-collapse">
      <thead><tr><th class="p-3 text-left text-slate-400 font-bold uppercase border-b-2 border-slate-200 bg-slate-50"></th>${headers}</tr></thead>
      <tbody>
        ${row("Match %",  r => r.match_pct)}
        ${row("Price (₹L)", r => r.vehicle.price_lakh?.toFixed(1), true)}
        ${textRow("Body Type", r => pretty(r.vehicle.body_type))}
        ${textRow("Fuel",      r => pretty(r.vehicle.fuel))}
        ${textRow("Transmission", r => r.vehicle.transmission?.toUpperCase())}
        ${row("Seats",       r => r.vehicle.seats)}
        ${row("Power (bhp)", r => r.vehicle.power_bhp)}
        ${row("Boot (L)",    r => r.vehicle.boot_litres)}
        ${row("Safety ★",   r => r.vehicle.safety_rating)}
        ${textRow("Efficiency", r => r.vehicle.fuel === "electric" ? `${r.vehicle.range_km} km` : `${r.vehicle.mileage_kmpl} km/l`)}
        ${featRows}
      </tbody>
    </table>`;
  $("#compare-modal").classList.remove("hidden");
}

function closeCompareModal() { $("#compare-modal").classList.add("hidden"); }

/* ── License scan simulation & route selector ─────────────────────────── */

function setRoute(btn) {
  document.querySelectorAll(".route-btn").forEach(b => {
    b.classList.remove("border-2","border-brand-500","bg-brand-50");
    b.classList.add("border","border-slate-200","bg-slate-50");
    b.querySelector("span").classList.remove("text-brand-700");
    b.querySelector("span").classList.add("text-slate-700");
  });
  btn.classList.add("border-2","border-brand-500","bg-brand-50");
  btn.classList.remove("border","border-slate-200","bg-slate-50");
  btn.querySelector("span").classList.add("text-brand-700");
  btn.querySelector("span").classList.remove("text-slate-700");
}

/* ── Test drive booking ───────────────────────────────────────────────── */
function openBookingModal(vehicleId, vehicleName, rank) {
  bookingTarget = { vehicleId, vehicleName, rank };
  $("#modal-vehicle-title").textContent = vehicleName;
  $("#td-date").min = new Date().toISOString().split("T")[0];
  // Pre-fill customer name from the active lead banner
  const leadName = $("#active-lead-name")?.textContent || "";
  if (leadName && leadName !== "New Walk-in" && !$("#td-name").value) {
    $("#td-name").value = leadName;
  }
  // Reset route to first option
  document.querySelectorAll(".route-btn").forEach((b, i) => setRoute(i === 0 ? b : b));
  const first = document.querySelector(".route-btn");
  if (first) setRoute(first);
  $("#schedule-modal").classList.remove("hidden");
}

function closeBookingModal() {
  $("#schedule-modal").classList.add("hidden");
  bookingTarget = null;
  $("#booking-form").reset();
}

async function confirmBooking(e) {
  e.preventDefault();
  if (!bookingTarget) return;
  const submitBtn = $("#booking-form").querySelector("[type=submit]");
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Booking…';
  try {
    const payload = {
      user_id:           USER_ID,
      vehicle_id:        bookingTarget.vehicleId,
      name:              $("#td-name").value,
      phone:             $("#td-phone").value,
      city:              $("#td-city").value,
      branch:            $("#td-branch").value || "",
      preferred_date:    $("#td-date").value,
      sales_officer:     $("#td-officer").value || "",
      recommendation_id: lastRecId,
    };
    const result = await api("/api/bookings/test-drive", payload);
    // Cache locally so the booking is visible even if Vercel routes the
    // subsequent GET to a different serverless instance with an empty /tmp DB.
    // Resolve image for the booked vehicle from currentResults
    const bookedResult = currentResults.find(r => r.vehicle.id === bookingTarget.vehicleId);
    const bv = bookedResult?.vehicle;
    const bookingImg = bv
      ? (bv.make === "Toyota" ? TOYOTA_IMAGES[bv.model.toLowerCase().trim()] : null)
        || (bv.fuel === "electric" ? ELECTRIC_IMG : (BODY_IMAGES[bv.body_type] || BODY_IMAGES.compact_suv))
      : "";
    saveLocalBooking({
      id:               result?.id ?? ("local_" + Date.now()),
      user_id:          payload.user_id,
      vehicle_id:       payload.vehicle_id,
      vehicle_name:     bookingTarget.vehicleName,
      vehicle_img:      bookingImg,
      vehicle_price:    bv?.price_lakh ?? null,
      name:             payload.name,
      phone:            payload.phone,
      city:             payload.city,
      branch:           payload.branch,
      preferred_date:   payload.preferred_date,
      sales_officer:    payload.sales_officer,
      ts:               Date.now() / 1000,
      completed:        0,
      taken_date:       null,
      _local:           true,
    });
    const bookedName = bookingTarget.vehicleName;
    closeBookingModal();
    showToast(`Test drive booked for ${bookedName}!`, "success");
    loadFleetStats();
    switchTab("leads");
    loadLeadInbox();
  } catch (err) {
    showToast("Booking failed: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-key"></i> Confirm &amp; Release Key';
  }
}

/* ── Load lead preset ─────────────────────────────────────────────────── */
function loadLead(key) {
  const p = LEAD_PROFILES[key];
  if (!p) return;
  $("#active-lead-name").textContent = p.name;
  $("#active-lead-sub").textContent  = p.sub;
  $("#input-budget-min").value = p.budgetMin;
  $("#input-budget-max").value = p.budgetMax;
  updateBudgetDisplay();

  // Fuels
  selectedFuels = [...p.fuels];
  document.querySelectorAll(".fuel-btn").forEach(b => {
    b.classList.toggle("active", selectedFuels.includes(b.dataset.fuel));
    if (b.dataset.fuel === "all") b.classList.toggle("active", !selectedFuels.length);
  });

  // Body types
  selectedBodies = [...p.bodies];
  document.querySelectorAll(".body-btn").forEach(b => b.classList.toggle("active", selectedBodies.includes(b.dataset.body)));

  // Transmission
  setTrans(p.trans, document.querySelector(`.trans-btn[data-trans="${p.trans}"]`));

  // Seats
  $("#input-seats").value = p.seats;

  // Features
  document.querySelectorAll("[data-feat]").forEach(cb => { cb.checked = p.features.includes(cb.dataset.feat); });

  // Priorities
  document.querySelectorAll("[data-prio]").forEach(cb => { cb.checked = p.priorities.includes(cb.dataset.prio); });

  showToast(`Loaded: ${p.name}`, "info");
  runAIMatch();
}

/* ── Reset filters ────────────────────────────────────────────────────── */
function resetFilters() {
  $("#input-budget-min").value = 10;
  $("#input-budget-max").value = 18;
  updateBudgetDisplay();
  selectedFuels  = [];
  selectedBodies = [];
  selectedTrans  = "any";
  document.querySelectorAll(".fuel-btn").forEach(b  => b.classList.toggle("active", b.dataset.fuel === "all"));
  document.querySelectorAll(".body-btn").forEach(b  => b.classList.remove("active"));
  document.querySelectorAll(".trans-btn").forEach(b => b.classList.toggle("active", b.dataset.trans === "any"));
  document.querySelectorAll("[data-feat],[data-prio]").forEach(cb => cb.checked = false);
  $("#input-seats").value = "";
  $("#fuel-strict").checked = false;
  $("#trans-strict").checked = false;
  $("#active-lead-name").textContent = "New Walk-in";
  $("#active-lead-sub").textContent  = "Set preferences below and click Recalculate.";
  showToast("Filters reset", "info");
}

/* ── Lead Inbox ───────────────────────────────────────────────────────── */
async function loadLeadInbox() {
  const container = $("#leads-table-container");
  try {
    // Fetch server bookings and vehicle catalog in parallel.
    const [serverBookings, vehicles] = await Promise.all([
      api("/api/bookings/test-drive"),
      api("/api/vehicles").catch(() => []),
    ]);

    // Vehicle lookup maps  id → name / image URL / price
    const vMap = {};
    const vImgMap = {};
    const vPriceMap = {};
    vehicles.forEach(v => {
      vMap[v.id] = `${v.make} ${v.model} ${v.variant || ""}`.trim();
      const toyotaImg = v.make === "Toyota" ? TOYOTA_IMAGES[v.model.toLowerCase().trim()] : null;
      vImgMap[v.id] = toyotaImg || (v.fuel === "electric" ? ELECTRIC_IMG : (BODY_IMAGES[v.body_type] || BODY_IMAGES.compact_suv));
      vPriceMap[v.id] = v.price_lakh;
    });

    // Merge: server is authoritative; fill gaps from localStorage (Vercel cold-start fix).
    const serverIds = new Set(serverBookings.map(b => String(b.id)));
    const localOnly = getLocalBookings().filter(b => !serverIds.has(String(b.id)));
    const bookings = [...serverBookings, ...localOnly].sort((a, b) => b.ts - a.ts);

    const badge = $("#leads-badge");
    if (bookings.length) { badge.textContent = bookings.length; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");

    if (!bookings.length) {
      container.innerHTML = `<p class="text-center text-slate-400 py-8 text-sm">No bookings yet. Customers who book test drives will appear here.</p>`;
      return;
    }

    const isLocal = b => b._local && !serverIds.has(String(b.id));

    container.innerHTML = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
            <th class="py-3 px-4">Done</th><th class="py-3 px-4">Customer</th>
            <th class="py-3 px-4">Vehicle</th><th class="py-3 px-4">City / Branch</th>
            <th class="py-3 px-4">Preferred Date</th><th class="py-3 px-4">Sales Officer</th>
            <th class="py-3 px-4">Booked At</th><th class="py-3 px-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${bookings.map(b => {
            const vName  = b.vehicle_name  || vMap[b.vehicle_id]   || `Vehicle #${b.vehicle_id}`;
            const vImg   = b.vehicle_img   || vImgMap[b.vehicle_id] || "";
            const vPrice = b.vehicle_price != null ? b.vehicle_price : vPriceMap[b.vehicle_id];
            const local = isLocal(b);
            return `
            <tr class="hover:bg-slate-50 transition${local ? " opacity-80" : ""}" data-bid="${b.id}">
              <td class="py-3 px-4">
                ${local
                  ? `<span class="w-8 h-8 rounded-full border-2 border-slate-200 text-slate-300 flex items-center justify-center text-sm" title="Saved locally">○</span>`
                  : `<button class="tick-btn w-8 h-8 rounded-full border-2 ${b.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-slate-400"} flex items-center justify-center text-sm font-bold hover:border-emerald-400 transition"
                      data-bid="${b.id}" data-completed="${b.completed ? 1 : 0}" title="Toggle test drive taken">
                      ${b.completed ? "✓" : "○"}
                    </button>`
                }
              </td>
              <td class="py-3 px-4 font-bold text-slate-900">${b.name}<br>
                <span class="text-[10px] text-slate-400 font-normal">${b.phone}</span></td>
              <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                  ${vImg ? `<img src="${vImg}" alt="${vName}"
                      class="w-14 h-10 object-cover rounded-lg shrink-0 bg-slate-100"
                      onerror="this.style.display='none'">` : ""}
                  <div>
                    <span class="text-brand-600 font-semibold text-xs leading-tight block">${vName}</span>
                    ${vPrice != null ? `<span class="text-emerald-600 font-bold text-[11px]">₹${Number(vPrice).toFixed(2)} L</span>` : ""}
                  </div>
                </div>
              </td>
              <td class="py-3 px-4 text-slate-600">${b.city}${b.branch ? ` · ${b.branch}` : ""}</td>
              <td class="py-3 px-4 font-semibold">${b.preferred_date}</td>
              <td class="py-3 px-4">
                ${local
                  ? `<span class="text-slate-400">${b.sales_officer || "—"}</span>`
                  : `<input type="text" class="officer-input border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 text-slate-800 w-32 focus:outline-none focus:border-brand-500"
                      value="${b.sales_officer || ""}" placeholder="Assign officer" data-bid="${b.id}">`
                }
              </td>
              <td class="py-3 px-4 text-slate-400">${new Date(b.ts * 1000).toLocaleString("en-IN", {dateStyle:"short",timeStyle:"short"})}</td>
              <td class="py-3 px-4 text-right">
                <span class="${b.completed ? "bg-emerald-100 text-emerald-800" : local ? "bg-blue-50 text-blue-700" : "bg-amber-100 text-amber-800"} text-[10px] font-bold px-2.5 py-1 rounded-full">
                  ${b.completed ? "Taken" : local ? "Booked" : "Pending"}
                </span>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;

    // Tick toggle (server bookings only)
    container.querySelectorAll(".tick-btn").forEach(btn => {
      btn.onclick = async () => {
        const completed = btn.dataset.completed !== "1";
        btn.disabled = true;
        try {
          await api(`/api/bookings/test-drive/${btn.dataset.bid}`, { completed }, "PATCH");
          showToast(completed ? "Marked as test drive taken" : "Marked as pending", "success");
          loadLeadInbox();
        } catch (err) {
          showToast("Update failed: " + err.message, "error");
        } finally { btn.disabled = false; }
      };
    });

    // Officer name update
    container.querySelectorAll(".officer-input").forEach(inp => {
      inp.addEventListener("change", async () => {
        try {
          await api(`/api/bookings/test-drive/${inp.dataset.bid}`, { sales_officer: inp.value || null }, "PATCH");
          showToast("Officer name saved", "success");
        } catch (err) { showToast("Save failed: " + err.message, "error"); }
      });
    });
  } catch (err) { showToast("Could not load leads: " + err.message, "error"); }
}

/* ── Test Drive Calendar (Schedule tab) ───────────────────────────────── */
async function loadSchedule() {
  try {
    const bookings = await api("/api/bookings/test-drive");
    const container = $("#schedule-container");
    if (!bookings.length) {
      container.innerHTML = `<p class="text-center text-slate-400 py-8 text-sm">No test drives scheduled yet.</p>`;
      return;
    }
    container.innerHTML = bookings.map(b => `
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-xl ${b.completed ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-600"} flex flex-col items-center justify-center font-black text-xs shrink-0">
            ${b.preferred_date.slice(5).replace("-","/")}
          </div>
          <div>
            <p class="font-bold text-xs text-slate-900">${b.name} · Vehicle #${b.vehicle_id}</p>
            <p class="text-[11px] text-slate-500">${b.city}${b.branch ? " · " + b.branch : ""}${b.sales_officer ? " · " + b.sales_officer : ""}</p>
            <p class="text-[11px] text-slate-400">${b.phone}</p>
          </div>
        </div>
        <span class="${b.completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"} text-[10px] font-bold px-2.5 py-1 rounded-full">
          ${b.completed ? "Test Drive Taken" : "Scheduled"}
        </span>
      </div>`
    ).join("");
  } catch (err) { showToast("Could not load schedule: " + err.message, "error"); }
}

/* ── Fleet stats (sidebar + fleet tab) ───────────────────────────────── */
async function loadFleetStats() {
  try {
    const [health, metrics, bookings] = await Promise.all([
      api("/api/health"),
      api("/api/metrics"),
      api("/api/bookings/test-drive"),
    ]);
    $("#vehicles-count").textContent = `${health.vehicles} vehicles in catalog`;
    const n = bookings.length;
    const goal = 20;
    const pct = Math.min(100, Math.round(n / goal * 100));
    $("#goal-label").textContent = `${n} Booked`;
    $("#goal-bar").style.width = pct + "%";

    const pctFmt = x => x == null ? "—" : (x * 100).toFixed(1) + "%";
    $("#topbar-ctr").innerHTML = `<i class="fa-solid fa-bullseye"></i><span>CTR ${pctFmt(metrics.ctr)}</span>`;
    $("#topbar-ctr").classList.remove("hidden");
    $("#topbar-tdr").innerHTML = `<i class="fa-solid fa-car-side"></i><span>Test drive rate ${pctFmt(metrics.test_drive_rate)}</span>`;
    $("#topbar-tdr").classList.remove("hidden");
  } catch (_) {}
}

async function loadFleet() {
  try {
    const [health, metrics, bookings, vehicles] = await Promise.all([
      api("/api/health"), api("/api/metrics"),
      api("/api/bookings/test-drive"), api("/api/vehicles"),
    ]);
    $("#fleet-total").textContent = health.vehicles + " vehicles";
    $("#fleet-booked").textContent = bookings.length;
    $("#fleet-impressions").textContent = metrics.impressions;

    // Fuel breakdown
    const fuelCounts = {};
    vehicles.forEach(v => { fuelCounts[v.fuel] = (fuelCounts[v.fuel] || 0) + 1; });
    const grid = $("#fleet-fuel-grid");
    grid.innerHTML = Object.entries(fuelCounts).map(([fuel, count]) => `
      <div class="p-4 rounded-xl border border-slate-200 bg-gradient-to-br ${FUEL_COLORS[fuel] || "from-slate-200 to-slate-300"} bg-opacity-20 text-center">
        <div class="text-2xl mb-1">${FUEL_EMOJI[fuel] || "🚗"}</div>
        <div class="text-lg font-black text-slate-900">${count}</div>
        <div class="text-xs font-semibold text-slate-600">${pretty(fuel)}</div>
      </div>`
    ).join("");
  } catch (err) { showToast("Could not load fleet data: " + err.message, "error"); }
}

/* ── Analytics ────────────────────────────────────────────────────────── */
async function loadAnalytics() {
  try {
    const m = await api("/api/metrics");
    const pct = x => x == null ? "—" : (x * 100).toFixed(1) + "%";

    $("#kpi-ctr").textContent  = pct(m.ctr);
    $("#kpi-ctr-sub").textContent = `${m.recommendation_clicks} clicks / ${m.impressions} impressions`;
    $("#kpi-tdr").textContent  = pct(m.test_drive_rate);
    $("#kpi-tdr-sub").textContent = `${m.test_drive_bookings} bookings`;
    $("#kpi-lcr").textContent  = pct(m.lead_conversion_rate);
    $("#kpi-lcr-sub").textContent = `${m.purchases} purchases`;
    $("#kpi-csat").textContent = pct(m.csat);
    $("#kpi-csat-sub").textContent = `${m.feedback_responses} responses`;

    // Funnel chart
    const fCtx = document.getElementById("funnelChart").getContext("2d");
    if (funnelChart) funnelChart.destroy();
    funnelChart = new Chart(fCtx, {
      type: "bar",
      data: {
        labels: ["Impressions", "Clicks", "Test Drives", "Purchases"],
        datasets: [{
          label: "Count",
          data: [m.impressions, m.recommendation_clicks, m.test_drive_bookings, m.purchases],
          backgroundColor: ["#94A3B8","#3B82F6","#2563EB","#10B981"],
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: "#F1F5F9" }, beginAtZero: true },
          x: { grid: { display: false } },
        },
      },
    });

    // Position CTR chart
    const pCtx = document.getElementById("positionChart").getContext("2d");
    if (posChart) posChart.destroy();
    const pos = m.ctr_by_position;
    if (pos?.length) {
      posChart = new Chart(pCtx, {
        type: "bar",
        data: {
          labels: pos.map(p => `#${p.position}`),
          datasets: [{
            label: "CTR",
            data: pos.map(p => p.ctr ? +(p.ctr * 100).toFixed(1) : 0),
            backgroundColor: "#3B82F6",
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: "#F1F5F9" }, beginAtZero: true, title: { display: true, text: "CTR %" } },
            x: { grid: { display: false }, title: { display: true, text: "Rank Position" } },
          },
        },
      });
    } else {
      document.getElementById("positionChart").parentElement.innerHTML =
        `<p class="text-slate-400 text-center py-16 text-sm">No position data yet — run some recommendations first.</p>`;
    }
  } catch (err) { showToast("Could not load analytics: " + err.message, "error"); }
}

/* ── Add Customer Profile Modal ───────────────────────────────────────── */
let npFuels  = [];
let npBodies = [];
let npTrans  = "any";
let npModalBuilt = false;

function buildNpModal(options) {
  if (npModalBuilt) return;

  const fuels = ["petrol","diesel","hybrid","electric","cng"];
  const fuelEl = $("#np-fuel-buttons");
  fuels.forEach(f => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.npFuel = f;
    b.textContent = `${FUEL_EMOJI[f] || ""} ${pretty(f)}`;
    b.className = "np-fuel-btn px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs hover:bg-slate-100 transition";
    b.onclick = () => {
      if (npFuels.includes(f)) { npFuels = npFuels.filter(x => x !== f); b.classList.remove("active"); }
      else { npFuels.push(f); b.classList.add("active"); }
    };
    fuelEl.appendChild(b);
  });

  const bodyEl = $("#np-body-buttons");
  options.body_types.forEach(bt => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.npBody = bt;
    b.textContent = pretty(bt);
    b.className = "np-body-btn px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs hover:bg-slate-100 transition";
    b.onclick = () => {
      if (npBodies.includes(bt)) { npBodies = npBodies.filter(x => x !== bt); b.classList.remove("active"); }
      else { npBodies.push(bt); b.classList.add("active"); }
    };
    bodyEl.appendChild(b);
  });

  const featEl = $("#np-feature-checks");
  options.features.forEach(f => {
    const label = document.createElement("label");
    label.className = "feat-row flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-np-feat="${f.key}" class="rounded text-brand-600 focus:ring-0">
                       <span class="font-semibold text-slate-700">${f.label}</span>`;
    featEl.appendChild(label);
  });

  const prioEl = $("#np-priority-checks");
  const icons = { safety:"🛡", performance:"⚡", space:"📦", efficiency:"🍃" };
  options.priorities.forEach(p => {
    const label = document.createElement("label");
    label.className = "feat-row flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-np-prio="${p}" class="rounded text-brand-600 focus:ring-0">
                       <span class="font-semibold text-slate-700">${icons[p] || ""} ${pretty(p)}</span>`;
    prioEl.appendChild(label);
  });

  npModalBuilt = true;
}

function openAddProfileModal() {
  npFuels = []; npBodies = []; npTrans = "any";
  $("#add-profile-form").reset();
  document.querySelectorAll(".np-fuel-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".np-body-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".np-trans-btn").forEach(b => b.classList.toggle("active", b.dataset.npTrans === "any"));
  document.querySelectorAll("[data-np-feat],[data-np-prio]").forEach(cb => cb.checked = false);
  $("#profile-modal").classList.remove("hidden");
}

function closeAddProfileModal() {
  $("#profile-modal").classList.add("hidden");
}

function setNpTrans(t, btn) {
  npTrans = t;
  document.querySelectorAll(".np-trans-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

async function saveNewProfile(e) {
  e.preventDefault();
  const feats = [...document.querySelectorAll("[data-np-feat]:checked")].map(x => x.dataset.npFeat);
  const prios = [...document.querySelectorAll("[data-np-prio]:checked")].map(x => x.dataset.npPrio);
  const profile = {
    name:      $("#np-name").value.trim(),
    sub:       $("#np-sub").value.trim(),
    budgetMin: parseFloat($("#np-budget-min").value || 0),
    budgetMax: parseFloat($("#np-budget-max").value || 25),
    fuels:     [...npFuels],
    bodies:    [...npBodies],
    trans:     npTrans,
    seats:     $("#np-seats").value,
    features:  feats,
    priorities: prios,
  };
  const btn = $("#np-submit-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Saving…';
  try {
    const saved = await api("/api/profiles", profile);
    closeAddProfileModal();
    showToast(`Profile "${saved.name}" saved!`, "success");
    loadSavedProfiles();
  } catch (err) {
    showToast("Could not save profile: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Save Profile';
  }
}

async function loadSavedProfiles() {
  try {
    const profiles = await api("/api/profiles");
    const container = $("#saved-profiles-container");
    if (!container) return;
    container.innerHTML = "";
    profiles.forEach(p => {
      const wrap = document.createElement("div");
      wrap.className = "relative group flex items-center";
      const btn = document.createElement("button");
      btn.className = "px-3 py-1.5 pr-7 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold text-xs hover:bg-emerald-100 transition";
      btn.textContent = p.name;
      btn.title = p.sub || "";
      btn.onclick = () => loadProfileFromObj(p);
      const del = document.createElement("button");
      del.className = "absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 transition text-[11px] font-black leading-none";
      del.textContent = "×";
      del.title = "Remove profile";
      del.onclick = (e) => { e.stopPropagation(); deleteProfile(p.id); };
      wrap.appendChild(btn);
      wrap.appendChild(del);
      container.appendChild(wrap);
    });
  } catch (_) {}
}

async function deleteProfile(id) {
  try {
    await api(`/api/profiles/${id}`, null, "DELETE");
    showToast("Profile removed", "info");
    loadSavedProfiles();
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

function loadProfileFromObj(p) {
  $("#active-lead-name").textContent = p.name;
  $("#active-lead-sub").textContent  = p.sub || "Saved profile";
  $("#input-budget-min").value = p.budgetMin;
  $("#input-budget-max").value = p.budgetMax;
  updateBudgetDisplay();
  selectedFuels = [...(p.fuels || [])];
  document.querySelectorAll(".fuel-btn").forEach(b => {
    b.classList.toggle("active", selectedFuels.includes(b.dataset.fuel));
    if (b.dataset.fuel === "all") b.classList.toggle("active", !selectedFuels.length);
  });
  selectedBodies = [...(p.bodies || [])];
  document.querySelectorAll(".body-btn").forEach(b => b.classList.toggle("active", selectedBodies.includes(b.dataset.body)));
  const transBtn = document.querySelector(`.trans-btn[data-trans="${p.trans || "any"}"]`);
  if (transBtn) setTrans(p.trans || "any", transBtn);
  $("#input-seats").value = p.seats || "";
  document.querySelectorAll("[data-feat]").forEach(cb => { cb.checked = (p.features || []).includes(cb.dataset.feat); });
  document.querySelectorAll("[data-prio]").forEach(cb => { cb.checked = (p.priorities || []).includes(cb.dataset.prio); });
  showToast(`Loaded: ${p.name}`, "info");
  runAIMatch();
}

/* ── Init ─────────────────────────────────────────────────────────────── */
async function initApp() {
  const user = getAuthUser();
  const userEl = document.getElementById("sidebar-username");
  if (userEl) userEl.textContent = user.charAt(0).toUpperCase() + user.slice(1);
  try {
    const o = await api("/api/options");
    o.features.forEach(f => { featuresMap[f.key] = f.label; });
    buildBodyChips(o.body_types);
    buildFeatureChecks(o.features);
    buildPriorityChecks(o.priorities);
    buildNpModal(o);
    updateBudgetDisplay();
    loadFleetStats();
    loadSavedProfiles();
    runAIMatch();
  } catch (err) {
    showToast("Failed to load options from API", "error");
  }
}

/* ── Bootstrap: check saved token before showing app ─────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  if (getToken()) {
    hideLoginOverlay();
    initApp();
  } else {
    showLoginOverlay();
  }
});
