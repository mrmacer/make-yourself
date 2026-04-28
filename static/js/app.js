/* ═══════════════════════════════════════════════════════════════════════════
   Reclaim the Macer — main app JS
   ═══════════════════════════════════════════════════════════════════════════ */

"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let settings = {};
let currentScreen = "home";
let appMode = "home";

// ── Nav config — both modes use no bottom nav; nav element is hidden ──────────
const NAV_CONFIGS = { work: [], home: [] };

// ── Home tool screens — get a "← Home" back button when accessed in HOME mode ─
const HOME_TOOL_SCREENS = new Set(["money", "travel", "movement", "vehicle", "subs", "dashboard"]);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  settings = await api("/api/settings");

  appMode = localStorage.getItem("app_mode") || "home";
  document.getElementById("mode-home").classList.toggle("active-pill", appMode === "home");
  document.getElementById("mode-work").classList.toggle("active-pill", appMode === "work");
  renderNav(appMode);
  nav(appMode === "work" ? "capture" : "home");
});

// ── Mode switching ────────────────────────────────────────────────────────────
function setMode(mode) {
  appMode = mode;
  localStorage.setItem("app_mode", mode);
  document.getElementById("mode-home").classList.toggle("active-pill", mode === "home");
  document.getElementById("mode-work").classList.toggle("active-pill", mode === "work");
  removeHomeBack();
  renderNav(mode);
  nav(mode === "work" ? "capture" : "home");
}

// ── Home back button — injected into tool screen content, not fixed overlay ──
function injectHomeBack(screen) {
  removeHomeBack();
  const screenEl = document.getElementById(`screen-${screen}`);
  if (!screenEl) return;
  const btn = document.createElement("button");
  btn.className = "home-back-btn";
  btn.textContent = "← Home";
  btn.onclick = () => nav("home");
  screenEl.insertBefore(btn, screenEl.firstChild);
}

function removeHomeBack() {
  document.querySelectorAll(".home-back-btn").forEach(b => b.remove());
}

function renderNav(mode) {
  const navEl = document.getElementById("nav");
  const items = NAV_CONFIGS[mode];
  navEl.innerHTML = items.map(item => `
    <button class="nav-btn ${currentScreen === item.screen ? "active" : ""}"
            data-screen="${item.screen}"
            onclick="nav('${item.screen}')">
      <span style="font-size:20px;line-height:1.1;">${item.emoji}</span>
      ${item.label}
    </button>
  `).join("");
}

// ── Router ────────────────────────────────────────────────────────────────────
function nav(screen) {
  currentScreen = screen;
  document.querySelectorAll(".screen").forEach(el =>
    el.classList.toggle("active", el.id === `screen-${screen}`)
  );
  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.screen === screen)
  );

  if (appMode === "home" && HOME_TOOL_SCREENS.has(screen)) {
    injectHomeBack(screen);
  } else {
    removeHomeBack();
  }

  if (screen === "log")        loadLog();
  if (screen === "dashboard")  loadDashboard();
  if (screen === "fund")       loadFund();
  if (screen === "debt")       loadDebt();
  if (screen === "subs")       loadSubs();
  if (screen === "movement")   loadMovement();
  if (screen === "spending")   loadSpending();
  if (screen === "settings")   loadSettings();
  if (screen === "vehicle")    loadVehicle();
  if (screen === "adventures") loadAdventures();
  if (screen === "capture")    loadCapture();
  if (screen === "home")       loadHome();
  if (screen === "activity")   loadActivity();
  if (screen === "travel")     loadTravel();
  if (screen === "habits")     loadHabits();
  if (screen === "money")      loadMoney();

  const activeNavBtn = document.querySelector(`#nav .nav-btn[data-screen="${screen}"]`);
  if (activeNavBtn) activeNavBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(url, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, duration = 2200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

// ── Today's date string ───────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y.slice(2)}`;
}

function fmtMoney(n) {
  return "$" + Math.abs(n).toFixed(2);
}

// ── Expand / collapse toggle (shared by Activity, Travel, Money forms) ────────
function toggleExpand(triggerEl) {
  const body = triggerEl.nextElementSibling;
  const label = triggerEl.querySelector(".expand-label");
  if (!body || !label) return;
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open", !isOpen);
  label.textContent = isOpen ? "▼ Add detail" : "▲ Less";
}


// ══════════════════════════════════════════════════════════════════════════════
// DAILY LOG
// ══════════════════════════════════════════════════════════════════════════════

const WEED_OPTS = [
  { val: 0, label: "NONE",   cls: "active-none"  },
  { val: 1, label: "LIGHT",  cls: "active-light" },
  { val: 2, label: "MOD",    cls: "active-mod"   },
  { val: 3, label: "HEAVY",  cls: "active-heavy" },
];

// Tobacco state: 0=NO, 1=YES
let tobaccoState = { am: 0, pm: 0, eve: 0 };
// Weed state: 0=NONE, 1=LIGHT, 2=MOD, 3=HEAVY
let weedState    = { am: 0, pm: 0, eve: 0 };

async function loadLog() {
  const [entry, habitLogs] = await Promise.all([
    api(`/api/log?date=${today()}`),
    api(`/api/habit-log?date=${today()}`),
  ]);

  if (habitLogs && habitLogs.length > 0) {
    const blocks = calcBlocksFromLogs(habitLogs);
    tobaccoState = { am: blocks.tobacco_am, pm: blocks.tobacco_pm, eve: blocks.tobacco_eve };
    weedState    = { am: blocks.weed_am,    pm: blocks.weed_pm,    eve: blocks.weed_eve };
  } else if (entry && entry.date) {
    tobaccoState = { am: entry.tobacco_am, pm: entry.tobacco_pm, eve: entry.tobacco_eve };
    weedState    = { am: entry.weed_am,    pm: entry.weed_pm,    eve: entry.weed_eve };
  } else {
    tobaccoState = { am: 0, pm: 0, eve: 0 };
    weedState    = { am: 0, pm: 0, eve: 0 };
  }

  document.getElementById("intention").value = entry?.intention || "";
  document.getElementById("log-note").value  = entry?.note || "";

  renderBlockGrid();
  updateLiveScore();
  renderTimeline(habitLogs, "habit-timeline");
}

// Derive block values from habit_logs array
function calcBlocksFromLogs(logs) {
  const blocks = {
    tobacco_am: 0, tobacco_pm: 0, tobacco_eve: 0,
    weed_am:    0, weed_pm:    0, weed_eve:    0,
  };
  const intensityMap = { none: 0, light: 1, mod: 2, heavy: 3 };

  logs.forEach(log => {
    const ts   = new Date(log.timestamp.replace(" ", "T"));
    const hour = ts.getHours();
    const suf  = hour < 12 ? "am" : hour < 18 ? "pm" : "eve";

    if (log.type === "tobacco") {
      blocks[`tobacco_${suf}`] = 1;
    } else if (log.type === "weed") {
      const iv  = intensityMap[log.intensity] ?? 0;
      const key = `weed_${suf}`;
      blocks[key] = Math.max(blocks[key], iv);
    }
  });

  return blocks;
}

// Render timeline into a given container element ID
function renderTimeline(logs, containerId = "habit-timeline") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!logs || !logs.length) {
    container.innerHTML = '<div class="empty" style="padding:8px 0 4px;">No logs today</div>';
    return;
  }

  const intensityColors = { none: "var(--green)", light: "var(--yellow)", mod: "#f97316", heavy: "var(--red)" };

  container.innerHTML = logs.map(log => {
    const ts   = new Date(log.timestamp.replace(" ", "T"));
    const time = ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const isWeed    = log.type === "weed";
    const typeColor = isWeed ? (intensityColors[log.intensity] || "var(--accent2)") : "var(--yellow)";
    const typeLabel = isWeed ? "Weed" : "Tobacco";
    const intensityLabel = isWeed ? ` · ${log.intensity}` : "";
    const triggerLabel   = log.trigger ? ` · ${log.trigger}` : "";

    return `
      <div class="timeline-entry">
        <div class="timeline-time">${time}</div>
        <div class="timeline-dot" style="background:${typeColor};"></div>
        <div class="timeline-info">
          <span style="color:${typeColor};font-weight:600;font-size:13px;">${typeLabel}</span>
          <span class="text-muted" style="font-size:12px;">${intensityLabel}${triggerLabel}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderBlockGrid() {
  ["am", "pm", "eve"].forEach(block => {
    const tBtn = document.getElementById(`t-${block}`);
    if (tBtn) renderTobaccoBtn(tBtn, tobaccoState[block]);
    const wGroup = document.getElementById(`w-group-${block}`);
    if (wGroup) renderWeedGroup(wGroup, weedState[block]);
  });
}

function renderTobaccoBtn(btn, val) {
  btn.textContent = val === 0 ? "NO" : "YES";
  btn.className = "toggle-btn " + (val === 0 ? "active-no" : "active-yes");
}

function renderWeedGroup(group, val) {
  group.querySelectorAll(".toggle-btn").forEach(btn => {
    const bval = parseInt(btn.dataset.val);
    btn.className = "toggle-btn " + (bval === val ? WEED_OPTS[bval].cls : "");
  });
}

// Wire up tobacco toggles
["am", "pm", "eve"].forEach(block => {
  const btn = document.getElementById(`t-${block}`);
  if (!btn) return;
  btn.addEventListener("click", () => {
    tobaccoState[block] = tobaccoState[block] === 0 ? 1 : 0;
    renderTobaccoBtn(btn, tobaccoState[block]);
    updateLiveScore();
  });
});

// Wire up weed toggles
document.querySelectorAll(".w-group").forEach(group => {
  const block = group.dataset.block;
  group.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      weedState[block] = parseInt(btn.dataset.val);
      renderWeedGroup(group, weedState[block]);
      updateLiveScore();
    });
  });
});

function calcLiveScore() {
  const s = settings;
  let score = 0;
  if (!s.xp_base) return { score: 0, money: 0, xp: 0 };
  const tSave = parseFloat(s.tobacco_block_save || 3);
  const wSave = [
    parseFloat(s.weed_none_save  || 3),
    parseFloat(s.weed_light_save || 1),
    parseFloat(s.weed_mod_save   || 0),
    parseFloat(s.weed_heavy_save || -1),
  ];
  let money = 0;
  ["am", "pm", "eve"].forEach(b => {
    if (tobaccoState[b] === 0) { score++; money += tSave; }
    const wv = weedState[b];
    if (wv === 0) score++;
    money += wSave[wv];
  });
  let xp = parseInt(s.xp_base) + score * parseInt(s.xp_per_score);
  if (score === 6) xp += parseInt(s.xp_perfect_bonus);
  return { score, money: Math.round(money * 100) / 100, xp };
}

function updateLiveScore() {
  const { score, money, xp } = calcLiveScore();
  const pct = score / 6;
  const r = 42, circ = 2 * Math.PI * r;
  const fill = document.querySelector(".score-ring .fill");
  if (fill) {
    fill.style.strokeDasharray  = circ;
    fill.style.strokeDashoffset = circ - pct * circ;
    fill.style.stroke = score === 6 ? "var(--green)" : score >= 4 ? "var(--accent)" : "var(--yellow)";
  }
  setEl("live-score", score);
  const moneyEl = document.getElementById("live-money");
  if (moneyEl) {
    moneyEl.textContent = (money >= 0 ? "+" : "") + "$" + money.toFixed(2);
    moneyEl.className   = "val " + (money >= 0 ? "green" : "text-red");
  }
  setEl("live-xp", "+" + xp + " XP");
}

document.getElementById("log-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("log-submit");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const result = await api("/api/log", "POST", {
    date:        today(),
    tobacco_am:  tobaccoState.am,
    tobacco_pm:  tobaccoState.pm,
    tobacco_eve: tobaccoState.eve,
    weed_am:     weedState.am,
    weed_pm:     weedState.pm,
    weed_eve:    weedState.eve,
    intention:   document.getElementById("intention").value.trim(),
    note:        document.getElementById("log-note").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Save Day";
  if (result.ok) {
    toast(`Score ${result.score}/6 · +$${result.money.toFixed(2)} · +${result.xp} XP`);
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// QUICK LOG
// ══════════════════════════════════════════════════════════════════════════════

let qlState = { type: null, intensity: null, trigger: null };

function openQuickLog() {
  qlState = { type: null, intensity: null, trigger: null };
  document.querySelectorAll(".ql-type-btn, .ql-int-btn, .ql-trig-btn").forEach(b =>
    b.classList.remove("active-yes", "active-no", "active-none", "active-light", "active-mod", "active-heavy", "active-accent")
  );
  document.getElementById("ql-intensity-row").classList.add("hidden");
  document.getElementById("ql-trigger-row").classList.add("hidden");
  document.getElementById("ql-submit-btn").classList.add("hidden");

  document.getElementById("ql-overlay").classList.remove("hidden");
  document.getElementById("ql-sheet").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQuickLog() {
  document.getElementById("ql-overlay").classList.add("hidden");
  document.getElementById("ql-sheet").classList.remove("open");
  document.body.style.overflow = "";
}

function qlSelectType(type) {
  qlState.type      = type;
  qlState.intensity = type === "tobacco" ? "none" : null;
  qlState.trigger   = null;

  document.querySelectorAll(".ql-type-btn").forEach(b => b.classList.remove("active-yes", "active-accent"));
  const activeBtn = document.getElementById(`ql-btn-${type}`);
  if (activeBtn) activeBtn.classList.add("active-yes");

  if (type === "weed") {
    document.getElementById("ql-intensity-row").classList.remove("hidden");
    document.getElementById("ql-trigger-row").classList.add("hidden");
    document.getElementById("ql-submit-btn").classList.add("hidden");
  } else {
    document.getElementById("ql-intensity-row").classList.add("hidden");
    document.getElementById("ql-trigger-row").classList.remove("hidden");
    document.getElementById("ql-submit-btn").classList.remove("hidden");
  }
}

const QL_INTENSITY_CLS = { none: "active-none", light: "active-light", mod: "active-mod", heavy: "active-heavy" };

function qlSelectIntensity(val) {
  qlState.intensity = val;
  document.querySelectorAll(".ql-int-btn").forEach(b =>
    b.classList.remove("active-none", "active-light", "active-mod", "active-heavy")
  );
  const btn = document.querySelector(`.ql-int-btn[data-val="${val}"]`);
  if (btn) btn.classList.add(QL_INTENSITY_CLS[val] || "active-yes");

  document.getElementById("ql-trigger-row").classList.remove("hidden");
  document.getElementById("ql-submit-btn").classList.remove("hidden");
}

function qlSelectTrigger(val) {
  if (qlState.trigger === val) {
    qlState.trigger = null;
    document.querySelectorAll(".ql-trig-btn").forEach(b => b.classList.remove("active-yes"));
  } else {
    qlState.trigger = val;
    document.querySelectorAll(".ql-trig-btn").forEach(b => b.classList.remove("active-yes"));
    const btn = document.querySelector(`.ql-trig-btn[data-val="${val}"]`);
    if (btn) btn.classList.add("active-yes");
  }
}

async function submitQuickLog() {
  if (!qlState.type) return;
  const btn = document.getElementById("ql-submit-btn");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const result = await api("/api/habit-log", "POST", {
    type:      qlState.type,
    intensity: qlState.intensity || "none",
    trigger:   qlState.trigger || null,
  });

  btn.disabled = false;
  btn.textContent = "Log It";

  if (result.ok) {
    const label = qlState.type === "tobacco"
      ? "Tobacco logged"
      : `Weed (${qlState.intensity}) logged`;
    toast(label + (qlState.trigger ? ` · ${qlState.trigger}` : ""));
    closeQuickLog();
    if (currentScreen === "log")    loadLog();
    if (currentScreen === "habits") loadHabits();
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
  const s = await api("/api/stats");

  setEl("dash-name", s.user_name || "Macer");

  const score   = s.today ? s.today.score : "–";
  const scoreEl = document.getElementById("dash-today-score");
  if (scoreEl) {
    scoreEl.textContent = score;
    if (s.today) {
      scoreEl.className = "val big " + (s.today.score === 6 ? "green" : s.today.score >= 4 ? "" : "yellow");
    }
  }
  setEl("dash-today-xp",    s.today ? "+" + s.today.xp + " XP" : "–");
  setEl("dash-today-money", s.today ? fmtMoney(s.today.money_reclaimed) : "–");

  setEl("dash-streak",      s.current_streak);
  setEl("dash-best-streak", s.best_streak);

  setEl("dash-week-avg",    s.week_avg_score.toFixed(1));
  setEl("dash-week-xp",     s.week_xp.toLocaleString());

  setEl("dash-all-money",   "$" + s.all_time_money.toFixed(2));
  setEl("dash-all-xp",      s.all_time_xp.toLocaleString());
  setEl("dash-all-days",    s.all_time_days);

  setEl("dash-month-tobacco", "$" + s.month_tobacco_saved.toFixed(2));
  setEl("dash-month-weed",    "$" + s.month_weed_saved.toFixed(2));
  setEl("dash-month-total",   "$" + s.month_money.toFixed(2));

  setEl("dash-ff", "$" + s.freedom_fund.toFixed(2));

  const pct    = s.debt_pct;
  const fillEl = document.getElementById("debt-fill");
  if (fillEl) fillEl.style.width = pct + "%";
  setEl("debt-pct-label",    pct.toFixed(1) + "%");
  setEl("debt-target-label", "$" + s.freedom_fund.toFixed(2) + " / $" + s.debt_target.toFixed(2));
  setEl("dash-months-left",  s.months_to_target ? s.months_to_target + " mo est." : "–");
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}


// ══════════════════════════════════════════════════════════════════════════════
// FREEDOM FUND
// ══════════════════════════════════════════════════════════════════════════════

async function loadFund() {
  const data = await api("/api/freedom-fund");
  setEl("ff-total", "$" + data.total.toFixed(2));
  const list = document.getElementById("ff-list");
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="empty">No entries yet.</div>';
    return;
  }
  list.innerHTML = data.entries.map(e => `
    <div class="list-row">
      <div class="main">
        <div class="bold">${escHtml(e.source)}</div>
        <div class="sub">${fmtDate(e.date)}${e.notes ? " · " + escHtml(e.notes) : ""}</div>
      </div>
      <div class="amt amt-pos">+${fmtMoney(e.amount)}</div>
      <button class="btn btn-sm btn-danger" onclick="deleteFund(${e.id})">✕</button>
    </div>
  `).join("");
}

document.getElementById("ff-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  await api("/api/freedom-fund", "POST", {
    date:   document.getElementById("ff-date").value || today(),
    source: document.getElementById("ff-source").value.trim(),
    amount: parseFloat(document.getElementById("ff-amount").value),
    notes:  document.getElementById("ff-notes").value.trim(),
  });
  e.target.reset();
  document.getElementById("ff-date").value = today();
  loadFund();
  toast("Entry added to Freedom Fund");
});

async function deleteFund(id) {
  await api(`/api/freedom-fund/${id}`, "DELETE");
  loadFund();
}

document.getElementById("ff-date") && (document.getElementById("ff-date").value = today());


// ══════════════════════════════════════════════════════════════════════════════
// DEBT BOSS
// ══════════════════════════════════════════════════════════════════════════════

async function loadDebt() {
  const s = await api("/api/stats");

  const pct    = s.debt_pct;
  const fillEl = document.getElementById("debt-full-fill");
  if (fillEl) fillEl.style.width = pct + "%";
  setEl("debt-full-pct",       pct.toFixed(1) + "%");
  setEl("debt-full-saved",     "$" + s.freedom_fund.toFixed(2));
  setEl("debt-full-target",    "$" + s.debt_target.toFixed(2));
  setEl("debt-full-total",     "$" + s.debt_total.toFixed(2));
  setEl("debt-full-remaining", "$" + Math.max(0, s.debt_target - s.freedom_fund).toFixed(2));
  setEl("debt-full-months",    s.months_to_target ? s.months_to_target + " months" : "–");
}


// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════════════════

let editingSubId = null;

async function loadSubs() {
  const data = await api("/api/subscriptions");
  setEl("subs-spend",   "$" + data.current_spend.toFixed(2) + "/mo");
  setEl("subs-savings", "$" + data.potential_savings.toFixed(2) + "/mo");

  const list = document.getElementById("subs-list");
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="empty">No subscriptions tracked yet.</div>';
    return;
  }
  list.innerHTML = data.entries.map(e => `
    <div class="list-row">
      <div class="main">
        <div class="flex gap8">
          <span class="bold">${escHtml(e.service)}</span>
          <span class="badge ${e.kill_it ? "badge-kill" : "badge-keep"}">${e.kill_it ? "KILL" : "KEEP"}</span>
        </div>
        <div class="sub">
          $${e.monthly_cost.toFixed(2)}/mo
          ${e.last_used ? " · last used " + fmtDate(e.last_used) : ""}
          ${e.notes ? " · " + escHtml(e.notes) : ""}
        </div>
      </div>
      <div class="flex gap8">
        <button class="btn btn-sm btn-ghost" onclick="editSub(${e.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSub(${e.id})">✕</button>
      </div>
    </div>
  `).join("");
}

document.getElementById("sub-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const payload = {
    service:      document.getElementById("sub-service").value.trim(),
    monthly_cost: parseFloat(document.getElementById("sub-cost").value),
    last_used:    document.getElementById("sub-last").value || null,
    kill_it:      document.getElementById("sub-kill").checked ? 1 : 0,
    notes:        document.getElementById("sub-notes").value.trim(),
  };
  if (editingSubId) {
    await api(`/api/subscriptions/${editingSubId}`, "PUT", payload);
    editingSubId = null;
    document.getElementById("sub-submit").textContent = "Add Subscription";
    toast("Subscription updated");
  } else {
    await api("/api/subscriptions", "POST", payload);
    toast("Subscription added");
  }
  e.target.reset();
  loadSubs();
});

async function editSub(id) {
  const data  = await api("/api/subscriptions");
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return;
  editingSubId = id;
  document.getElementById("sub-service").value = entry.service;
  document.getElementById("sub-cost").value    = entry.monthly_cost;
  document.getElementById("sub-last").value    = entry.last_used || "";
  document.getElementById("sub-kill").checked  = entry.kill_it === 1;
  document.getElementById("sub-notes").value   = entry.notes || "";
  document.getElementById("sub-submit").textContent = "Update";
  document.getElementById("sub-service").focus();
}

async function deleteSub(id) {
  await api(`/api/subscriptions/${id}`, "DELETE");
  loadSubs();
}


// ══════════════════════════════════════════════════════════════════════════════
// SPENDING TRACKER
// ══════════════════════════════════════════════════════════════════════════════

const SPEND_CATEGORY_COLORS = {
  Food:         "var(--green)",
  Gas:          "var(--yellow)",
  Wawa:         "#a78bfa",
  Subscription: "#f97316",
  Random:       "var(--text2)",
};

async function loadSpending() {
  const data = await api("/api/spending");

  setEl("spend-today", "$" + data.today_total.toFixed(2));
  setEl("spend-week",  "$" + data.week_total.toFixed(2));

  const recent = document.getElementById("spend-recent");
  if (recent) {
    if (!data.last5.length) {
      recent.innerHTML = '<div class="empty">No transactions yet.</div>';
    } else {
      recent.innerHTML = data.last5.map(e => `
        <div class="list-row">
          <div class="main">
            <div class="bold">${escHtml(e.merchant)}</div>
            <div class="sub">${fmtDate(e.date)} · <span style="color:${SPEND_CATEGORY_COLORS[e.category] || "var(--text2)"};">${escHtml(e.category)}</span>${e.notes ? " · " + escHtml(e.notes) : ""}</div>
          </div>
          <div class="amt amt-neg">-${fmtMoney(e.amount)}</div>
        </div>
      `).join("");
    }
  }

  const list = document.getElementById("spend-list");
  if (list) {
    if (!data.entries.length) {
      list.innerHTML = '<div class="empty">No transactions yet.</div>';
    } else {
      list.innerHTML = data.entries.map(e => `
        <div class="list-row">
          <div class="main">
            <div class="bold">${escHtml(e.merchant)}</div>
            <div class="sub">${fmtDate(e.date)} · <span style="color:${SPEND_CATEGORY_COLORS[e.category] || "var(--text2)"};">${escHtml(e.category)}</span>${e.notes ? " · " + escHtml(e.notes) : ""}</div>
          </div>
          <div class="amt amt-neg" style="white-space:nowrap;">-${fmtMoney(e.amount)}</div>
          <button class="btn btn-sm btn-danger" onclick="deleteSpending(${e.id})">✕</button>
        </div>
      `).join("");
    }
  }
}

document.getElementById("spend-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("spend-submit");
  btn.disabled = true;
  btn.textContent = "Adding…";

  await api("/api/spending", "POST", {
    merchant: document.getElementById("sp-merchant").value.trim(),
    amount:   parseFloat(document.getElementById("sp-amount").value),
    category: document.getElementById("sp-category").value,
    notes:    document.getElementById("sp-notes").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Add Transaction";

  e.target.reset();
  loadSpending();
  toast("Transaction logged");
});

async function deleteSpending(id) {
  await api(`/api/spending/${id}`, "DELETE");
  loadSpending();
}


// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

async function loadSettings() {
  const s = await api("/api/settings");
  const fields = [
    "user_name","tobacco_block_save","weed_none_save","weed_light_save",
    "weed_mod_save","weed_heavy_save","xp_base","xp_per_score",
    "xp_perfect_bonus","debt_total","debt_target","streak_min_score",
  ];
  fields.forEach(k => {
    const el = document.getElementById(`s-${k}`);
    if (el) el.value = s[k] || "";
  });
}

document.getElementById("settings-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const payload = {};
  e.target.querySelectorAll("[data-key]").forEach(el => {
    payload[el.dataset.key] = el.value;
  });
  await api("/api/settings", "POST", payload);
  settings = await api("/api/settings");
  toast("Settings saved");
});


// ══════════════════════════════════════════════════════════════════════════════
// MOVEMENT
// ══════════════════════════════════════════════════════════════════════════════

function fmtPace(paceMinPerKm) {
  if (!paceMinPerKm) return "–";
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

async function loadMovement() {
  const data = await api("/api/workouts?limit=20");

  setEl("move-week-km",    data.week_km.toFixed(1));
  setEl("move-week-runs",  data.week_runs);
  setEl("move-total-runs", data.total_runs);

  const lastEl = document.getElementById("move-last-run");
  if (lastEl) {
    const last = data.entries[0];
    if (last) {
      const parts = [];
      if (last.date)             parts.push(`<span class="bold">${fmtDate(last.date)}</span>`);
      if (last.distance_km)      parts.push(`${last.distance_km.toFixed(2)} km`);
      if (last.avg_pace)         parts.push(fmtPace(last.avg_pace));
      if (last.avg_hr)           parts.push(`${last.avg_hr} bpm`);
      if (last.duration_minutes) parts.push(`${last.duration_minutes} min`);
      lastEl.innerHTML = `<div style="font-size:14px;line-height:1.8;">${parts.join(" &middot; ")}</div>`;
      if (last.notes) {
        lastEl.innerHTML += `<div class="text-muted text-sm" style="margin-top:4px;">${escHtml(last.notes)}</div>`;
      }
    } else {
      lastEl.textContent = "No runs logged yet.";
    }
  }

  const list = document.getElementById("workout-list");
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="empty">No workouts logged yet.</div>';
    return;
  }
  list.innerHTML = data.entries.map(e => {
    const meta = [];
    if (e.distance_km)      meta.push(`${e.distance_km.toFixed(2)} km`);
    if (e.duration_minutes) meta.push(`${e.duration_minutes} min`);
    if (e.avg_pace)         meta.push(fmtPace(e.avg_pace));
    if (e.avg_hr)           meta.push(`${e.avg_hr} bpm`);
    if (e.calories)         meta.push(`${e.calories} cal`);
    return `
      <div class="list-row">
        <div class="main">
          <div class="flex gap8">
            <span class="bold">${escHtml(e.type)}</span>
            <span class="text-muted text-sm">${fmtDate(e.date)}</span>
            <span class="badge badge-keep">+${e.xp} XP</span>
          </div>
          <div class="sub">${meta.join(" · ")}${e.notes ? " · " + escHtml(e.notes) : ""}</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteWorkout(${e.id})">✕</button>
      </div>
    `;
  }).join("");
}

document.getElementById("workout-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("workout-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const result = await api("/api/workouts", "POST", {
    date:             document.getElementById("w-date").value || today(),
    type:             document.getElementById("w-type").value,
    distance_km:      document.getElementById("w-distance").value || null,
    duration_minutes: document.getElementById("w-duration").value || null,
    avg_hr:           document.getElementById("w-hr").value || null,
    calories:         document.getElementById("w-calories").value || null,
    notes:            document.getElementById("w-notes").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Log Workout";

  if (result.ok) {
    const dist  = parseFloat(document.getElementById("w-distance").value) || 0;
    const bonus = dist >= 5 ? " 🔥 5km bonus!" : "";
    toast(`+${result.xp} XP logged${bonus}`);
    e.target.reset();
    document.getElementById("w-date").value = today();
    loadMovement();
  }
});

async function deleteWorkout(id) {
  await api(`/api/workouts/${id}`, "DELETE");
  loadMovement();
}


// ══════════════════════════════════════════════════════════════════════════════
// VEHICLE (SILVERADO)
// ══════════════════════════════════════════════════════════════════════════════

let vehicleTab = "checklist";

function switchVehicleTab(tab) {
  vehicleTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".vtab").forEach(el =>
    el.classList.toggle("active", el.id === `vtab-${tab}`)
  );
  if (tab === "checklist")   loadChecklist();
  if (tab === "vitals")      loadVitals();
  if (tab === "maintenance") loadMaintenance();
}

async function loadVehicle() {
  switchVehicleTab(vehicleTab);
}

const STATUS_CYCLE = { not_done: "done", done: "monitoring", monitoring: "not_done" };
const STATUS_LABELS = { not_done: "Not Done", done: "Done", monitoring: "Monitoring" };

async function loadChecklist() {
  const data = await api("/api/vehicle/checklist");
  [1, 2, 3, 4].forEach(p => {
    const container = document.getElementById(`checklist-list-${p}`);
    if (!container) return;
    const items = data[p] || [];
    if (!items.length) {
      container.innerHTML = '<div class="checklist-item"><span class="text-muted text-sm">No items</span></div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="checklist-item" id="cli-${item.id}" onclick="cycleChecklistStatus(${item.id}, '${item.status}')">
        <div class="checklist-item-row">
          <span class="checklist-item-name">${escHtml(item.item)}</span>
          <span class="status-badge status-${item.status}">${STATUS_LABELS[item.status] || item.status}</span>
        </div>
        ${item.last_checked ? `<div class="checklist-item-meta">Last checked ${fmtDate(item.last_checked)}${item.notes ? " · " + escHtml(item.notes) : ""}</div>` : ""}
      </div>
    `).join("");
  });
}

async function cycleChecklistStatus(id, currentStatus) {
  const newStatus = STATUS_CYCLE[currentStatus] || "not_done";
  await api(`/api/vehicle/checklist/${id}`, "POST", { status: newStatus });
  loadChecklist();
}

async function loadVitals() {
  const data = await api("/api/vehicle/vitals");
  const first = data.entries[0];
  if (first) {
    setEl("vitals-mpg",  first.mpg ? first.mpg.toFixed(1) : "–");
    setEl("vitals-odo",  first.odometer ? first.odometer.toLocaleString() : "–");
    setEl("vitals-temp", first.trans_temp ? first.trans_temp + "°" : "–");
  }

  const list = document.getElementById("vitals-list");
  if (!list) return;
  const entries = data.entries.slice(0, 10);
  if (!entries.length) {
    list.innerHTML = '<div class="empty">No vitals logged yet.</div>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const meta = [];
    if (e.odometer)     meta.push(`${e.odometer.toLocaleString()} mi`);
    if (e.miles_driven) meta.push(`+${e.miles_driven} driven`);
    if (e.gallons)      meta.push(`${e.gallons.toFixed(2)} gal`);
    if (e.mpg)          meta.push(`${e.mpg.toFixed(1)} MPG`);
    if (e.trans_temp)   meta.push(`${e.trans_temp}°F trans`);
    return `
      <div class="list-row">
        <div class="main">
          <div class="bold">${fmtDate(e.date)}</div>
          <div class="sub">${meta.join(" · ")}${e.notes ? " · " + escHtml(e.notes) : ""}</div>
        </div>
      </div>
    `;
  }).join("");
}

document.addEventListener("input", e => {
  if (e.target.id === "vt-odo" || e.target.id === "vt-gallons") {
    const odoEl = document.getElementById("vt-odo");
    const galEl = document.getElementById("vt-gallons");
    const prevOdo = parseInt(document.getElementById("vt-odo")?.dataset.prevOdo || "0");
    const odo = parseInt(odoEl?.value) || 0;
    const gal = parseFloat(galEl?.value) || 0;
    const preview = document.getElementById("vt-mpg-preview");
    if (!preview) return;
    if (odo > 0 && gal > 0 && prevOdo > 0 && odo > prevOdo) {
      const driven = odo - prevOdo;
      const mpg = driven / gal;
      preview.textContent = `Est. MPG: ${mpg.toFixed(1)} (${driven} miles / ${gal.toFixed(2)} gal)`;
    } else {
      preview.textContent = "";
    }
  }
});

document.getElementById("vitals-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("vitals-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const result = await api("/api/vehicle/vitals", "POST", {
    date:       document.getElementById("vt-date").value || today(),
    odometer:   document.getElementById("vt-odo").value,
    gallons:    document.getElementById("vt-gallons").value || null,
    trans_temp: document.getElementById("vt-temp").value || null,
    notes:      document.getElementById("vt-notes").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Log Vitals";

  if (result.ok) {
    const msg = result.mpg ? `Logged · ${result.mpg.toFixed(1)} MPG` : "Vitals logged";
    toast(msg);
    e.target.reset();
    document.getElementById("vt-date").value = today();
    loadVitals();
  }
});

async function loadMaintenance() {
  const data = await api("/api/vehicle/maintenance");
  setEl("maint-total", "$" + data.total_cost.toFixed(2) + " total");

  const list = document.getElementById("maint-list");
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="empty">No maintenance logged yet.</div>';
    return;
  }
  list.innerHTML = data.entries.map(e => `
    <div class="list-row">
      <div class="main">
        <div class="bold">${escHtml(e.task)}</div>
        <div class="sub">${fmtDate(e.date)} · ${e.mileage.toLocaleString()} mi${e.notes ? " · " + escHtml(e.notes) : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${e.cost ? `<span class="amt amt-neg" style="font-size:14px;">-$${e.cost.toFixed(2)}</span>` : ""}
        <button class="btn btn-sm btn-danger" onclick="deleteMaintenance(${e.id})">✕</button>
      </div>
    </div>
  `).join("");
}

document.getElementById("maint-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("maint-submit");
  btn.disabled = true;
  btn.textContent = "Adding…";

  await api("/api/vehicle/maintenance", "POST", {
    date:    document.getElementById("mt-date").value || today(),
    mileage: document.getElementById("mt-mileage").value,
    task:    document.getElementById("mt-task").value.trim(),
    cost:    document.getElementById("mt-cost").value || null,
    notes:   document.getElementById("mt-notes").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Add Entry";

  toast("Maintenance logged");
  e.target.reset();
  document.getElementById("mt-date").value = today();
  loadMaintenance();
});

async function deleteMaintenance(id) {
  await api(`/api/vehicle/maintenance/${id}`, "DELETE");
  loadMaintenance();
}


// ══════════════════════════════════════════════════════════════════════════════
// ADVENTURES
// ══════════════════════════════════════════════════════════════════════════════

let advRating = 0;
let advFormOpen = false;

function toggleAdvForm() {
  advFormOpen = !advFormOpen;
  const form = document.getElementById("adv-form");
  const tog  = document.getElementById("adv-form-toggle");
  if (form) form.style.display = advFormOpen ? "block" : "none";
  if (tog)  tog.textContent    = advFormOpen ? "−" : "＋";
}

document.addEventListener("click", e => {
  if (!e.target.classList.contains("star")) return;
  const stars = document.getElementById("adv-stars");
  if (!stars || !stars.contains(e.target)) return;
  advRating = parseInt(e.target.dataset.val);
  stars.querySelectorAll(".star").forEach(s => {
    s.classList.toggle("active", parseInt(s.dataset.val) <= advRating);
  });
});

async function loadAdventures() {
  const data = await api("/api/adventures");

  setEl("adv-total-count",  data.total_adventures);
  setEl("adv-total-xp",     data.total_xp.toLocaleString());
  setEl("adv-total-miles",  data.total_miles.toFixed(1));
  setEl("adv-total-states", data.states_visited.length);

  const list = document.getElementById("adv-list");
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="empty" style="padding:40px 16px;">No adventures logged yet.<br><span style="font-size:12px;">Tap Log Adventure above to add one.</span></div>';
    return;
  }

  list.innerHTML = data.entries.map(e => {
    const meta = [];
    if (e.location) meta.push(escHtml(e.location) + (e.state ? `, ${escHtml(e.state)}` : ""));
    if (e.distance_mi) meta.push(`${e.distance_mi.toFixed(1)} mi`);
    if (e.elevation_ft) meta.push(`${e.elevation_ft.toLocaleString()} ft gain`);
    if (e.duration_minutes) meta.push(`${e.duration_minutes} min`);
    if (e.difficulty) meta.push(escHtml(e.difficulty));

    const stars = e.rating ? "★".repeat(e.rating) + "☆".repeat(5 - e.rating) : "";
    return `
      <div class="adv-card">
        <div class="flex-between" style="margin-bottom:4px;">
          <div class="adv-card-title">${escHtml(e.title)}</div>
          <button class="btn btn-sm btn-danger" onclick="deleteAdventure(${e.id})" style="flex-shrink:0;">✕</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <span class="adv-type-badge">${escHtml(e.type)}</span>
          <span class="adv-xp-badge">+${e.xp} XP</span>
          ${stars ? `<span style="color:var(--yellow);font-size:13px;letter-spacing:1px;">${stars}</span>` : ""}
          <span class="text-muted text-sm">${fmtDate(e.date)}</span>
        </div>
        ${meta.length ? `<div class="adv-card-meta">${meta.join(" · ")}</div>` : ""}
        ${e.notes ? `<div class="text-muted text-sm" style="margin-top:4px;">${escHtml(e.notes)}</div>` : ""}
      </div>
    `;
  }).join("");
}

document.getElementById("adv-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("adv-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const state = document.getElementById("adv-state").value.trim().toUpperCase();

  const result = await api("/api/adventures", "POST", {
    date:             document.getElementById("adv-date").value || today(),
    title:            document.getElementById("adv-title").value.trim(),
    type:             document.getElementById("adv-type").value,
    location:         document.getElementById("adv-location").value.trim(),
    state:            state || null,
    distance_mi:      document.getElementById("adv-distance").value || null,
    duration_minutes: document.getElementById("adv-duration").value || null,
    elevation_ft:     document.getElementById("adv-elevation").value || null,
    difficulty:       document.getElementById("adv-difficulty").value || null,
    rating:           advRating || null,
    notes:            document.getElementById("adv-notes").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Log Adventure";

  if (result.ok) {
    toast(`Adventure logged · +${result.xp} XP`);
    e.target.reset();
    advRating = 0;
    document.querySelectorAll("#adv-stars .star").forEach(s => s.classList.remove("active"));
    document.getElementById("adv-date").value = today();
    loadAdventures();
  }
});

async function deleteAdventure(id) {
  await api(`/api/adventures/${id}`, "DELETE");
  loadAdventures();
}


// ══════════════════════════════════════════════════════════════════════════════
// WORK CAPTURE
// ══════════════════════════════════════════════════════════════════════════════

const GAS_URL = "https://script.google.com/macros/s/AKfycbxBSJ5zJOxkCKLqix_FMfouATncy94mPiXaq7v__ToogC3ACo5lZtnnw415j616FZUh/exec";

const WORK_ORBITS = [
  { id:"daily",     icon:"📓", name:"Daily",        color:"#a78bfa",
    subs:["Daily Reflection","Random Thought / Brain Spark"] },
  { id:"pd",        icon:"🎓", name:"Prof. Dev",     color:"#e8c547",
    subs:["Makerspace Training","AI Literacy Session","STEM Integration PD",
          "Instructional Tech Training","District Curriculum Consult",
          "KTI Facilitation","CSO Program PD","Self-Directed Learning",
          "Conference / External PD","Workshop Design"] },
  { id:"comp",      icon:"🏆", name:"Competitions",  color:"#e8875b",
    subs:["Keystone STEM Competition","Sea Air & Land Challenge","STEM Design Challenge",
          "What's So Cool About Mfg","Academic League","Science Fair",
          "Remake Learning Days","Event Logistics","Student Recruitment"] },
  { id:"maker",     icon:"🔧", name:"MakerSpace",    color:"#c45be8",
    subs:["Workshop Facilitation","Equipment Training","Space Design / Setup",
          "Family Maker Night","Drop-In Session","Lending Library",
          "Resource Procurement","Student Project Support"] },
  { id:"summer",    icon:"☀️", name:"Summer",        color:"#f4a259",
    subs:["Camp Planning","Camp Delivery","Camp Follow-Up",
          "Teacher Summer PD","District Camp Partnership","Curriculum Development"] },
  { id:"workforce", icon:"🏭", name:"Workforce",     color:"#5be8a0",
    subs:["Work-Based Learning","Industry Partnership Dev.","Career Awareness Program",
          "Post-Secondary Connection","Employer Engagement",
          "I-81 Digital Corridor","Data Center / Tech Sector"] },
  { id:"support",   icon:"🏫", name:"Districts",     color:"#5b8dd9",
    subs:["District STEM Consultation","Lesson Design Support","STEELS / PA Core Alignment",
          "Tech Integration Coaching","CSO District Liaison",
          "Teacher Coaching / Mentoring","Curriculum Review"] },
  { id:"strategic", icon:"🌐", name:"Strategic",     color:"#e85b8a",
    subs:["PAIMS Work","SSoS / STEMinPA","ENGINE Collaborative","IU15 Partnership",
          "IU12 Partnership","CSO Regional Lead","Ecosystem Mapping",
          "Coalition Building","The Playful Shift","External Presentations"] },
  { id:"admin",     icon:"📋", name:"Admin/Grant",   color:"#9f9f9f",
    subs:["Grant Writing","ORBIT Reporting","Budget Planning","Partnership Development",
          "Event Logistics","Email / Communication","Resource Creation",
          "Data Collection / Analysis","Proposal Work"] },
];

const SOW_TAGS = [
  "CSO Regional Lead","STEMinPA / SSoS","PAIMS","KTI Lead Learner",
  "District PD","Competition Mgmt","Grant Funded","IU29 Internal",
  "Billable","The Playful Shift",
];

const PEOPLE_SUGGESTIONS = [
  "Autumn","Amy","Annie","Sue Voigt","Jen Sciacca","Waters",
  "Demetrius","Pam Dinan","meeting","proposal","IU15","IU12","ENGINE",
];

let wcState = {
  orbitId: null, subName: null,
  priority: null, mood: null, reflType: null,
  sowTags: [], peopleTags: [],
};
let wcSessionLog = [];
let wcAdvOpen = false;
let wcDraftTimer = null;

function loadCapture() {
  renderOrbits();
  renderSowTags();
  renderPeopleSuggestions();
  renderWcStreak();
  checkWcDraft();
}

function renderOrbits() {
  const container = document.getElementById("wc-orbits");
  if (!container) return;
  container.innerHTML = WORK_ORBITS.map(o => `
    <button type="button" class="orbit-pill" data-orbit="${o.id}"
            onclick="selectOrbit('${o.id}')"
            style="--orbit-color:${o.color}">
      ${o.icon} ${o.name}
    </button>
  `).join("");
  if (wcState.orbitId) {
    const btn = container.querySelector(`[data-orbit="${wcState.orbitId}"]`);
    if (btn) applyOrbitActive(btn);
  }
}

function applyOrbitActive(btn) {
  const orbitId = btn.dataset.orbit;
  const orbit = WORK_ORBITS.find(o => o.id === orbitId);
  if (!orbit) return;
  document.querySelectorAll(".orbit-pill").forEach(b => {
    b.style.borderColor = "";
    b.style.color = "";
    b.style.background = "";
  });
  btn.style.borderColor = orbit.color;
  btn.style.color = orbit.color;
  btn.style.background = orbit.color + "22";
}

function selectOrbit(orbitId) {
  wcState.orbitId = orbitId;
  wcState.subName = null;
  const orbit = WORK_ORBITS.find(o => o.id === orbitId);
  const btn = document.querySelector(`.orbit-pill[data-orbit="${orbitId}"]`);
  if (btn) applyOrbitActive(btn);

  const subsEl = document.getElementById("wc-subs");
  if (!subsEl || !orbit) return;
  subsEl.style.display = "flex";
  subsEl.innerHTML = orbit.subs.map(s => `
    <button type="button" class="sub-chip" onclick="selectSub('${escHtml(s)}')">${escHtml(s)}</button>
  `).join("");
  wcSaveDraft();
}

function selectSub(subName) {
  wcState.subName = subName;
  document.querySelectorAll("#wc-subs .sub-chip").forEach(c => {
    c.classList.toggle("active", c.textContent === subName);
  });
  wcSaveDraft();
}

function wcSelect(field, val, btn) {
  if (wcState[field] === val) {
    wcState[field] = null;
    btn.classList.remove("active");
  } else {
    wcState[field] = val;
    btn.closest(".wc-selector-row").querySelectorAll(".wc-sel-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  wcSaveDraft();
}

function toggleWcSow(tag, btn) {
  const idx = wcState.sowTags.indexOf(tag);
  if (idx > -1) {
    wcState.sowTags.splice(idx, 1);
    btn.classList.remove("active");
  } else {
    wcState.sowTags.push(tag);
    btn.classList.add("active");
  }
  wcSaveDraft();
}

function renderSowTags() {
  const row = document.getElementById("wc-sow-row");
  if (!row) return;
  row.innerHTML = SOW_TAGS.map(t => `
    <button type="button" class="wc-sel-btn ${wcState.sowTags.includes(t) ? "active" : ""}"
            onclick="toggleWcSow('${escHtml(t)}',this)">${escHtml(t)}</button>
  `).join("");
}

function renderPeopleSuggestions() {
  const el = document.getElementById("wc-people-suggestions");
  if (!el) return;
  el.innerHTML = PEOPLE_SUGGESTIONS.map(p => `
    <button type="button" class="sub-chip" onclick="addPeopleTag('${escHtml(p)}')">${escHtml(p)}</button>
  `).join("");
}

function addPeopleTag(name) {
  if (!name || wcState.peopleTags.includes(name)) return;
  wcState.peopleTags.push(name);
  renderPeoplePills();
  wcSaveDraft();
}

function removePeopleTag(name) {
  wcState.peopleTags = wcState.peopleTags.filter(t => t !== name);
  renderPeoplePills();
  wcSaveDraft();
}

function renderPeoplePills() {
  const wrap = document.getElementById("wc-people-wrap");
  const input = document.getElementById("wc-people-input");
  if (!wrap || !input) return;
  wrap.querySelectorAll(".people-pill").forEach(p => p.remove());
  wcState.peopleTags.forEach(tag => {
    const pill = document.createElement("span");
    pill.className = "people-pill";
    pill.innerHTML = `${escHtml(tag)} <span onclick="removePeopleTag('${escHtml(tag)}')" style="opacity:.6;">×</span>`;
    wrap.insertBefore(pill, input);
  });
}

document.getElementById("wc-people-input")?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) { addPeopleTag(val); e.target.value = ""; }
  }
  if (e.key === "Backspace" && !e.target.value && wcState.peopleTags.length) {
    removePeopleTag(wcState.peopleTags[wcState.peopleTags.length - 1]);
  }
});

function toggleWcAdvanced() {
  wcAdvOpen = !wcAdvOpen;
  const el = document.getElementById("wc-advanced");
  const icon = document.getElementById("wc-adv-icon");
  if (el) el.classList.toggle("hidden", !wcAdvOpen);
  if (icon) icon.textContent = wcAdvOpen ? "▾" : "▸";
}

function getWcStreak() {
  try {
    const raw = localStorage.getItem("mc_work_streak");
    return raw ? JSON.parse(raw) : { lastDate: null, count: 0 };
  } catch { return { lastDate: null, count: 0 }; }
}

function bumpWcStreak() {
  const streak = getWcStreak();
  const t = today();
  if (streak.lastDate === t) return streak.count;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newCount = streak.lastDate === yesterday ? streak.count + 1 : 1;
  localStorage.setItem("mc_work_streak", JSON.stringify({ lastDate: t, count: newCount }));
  return newCount;
}

function renderWcStreak() {
  const streak = getWcStreak();
  const el = document.getElementById("wc-streak-display");
  if (!el) return;
  el.textContent = streak.count > 0 ? `🔥 ${streak.count} day streak` : "";
}

const WC_DRAFT_KEY = "mc_draft_v3";

function wcSaveDraft() {
  clearTimeout(wcDraftTimer);
  wcDraftTimer = setTimeout(() => {
    const draft = {
      date:      document.getElementById("wc-date")?.value,
      note:      document.getElementById("wc-note")?.value,
      energy:    document.getElementById("wc-energy")?.value,
      progress:  document.getElementById("wc-progress")?.value,
      load:      document.getElementById("wc-load")?.value,
      orbitId:   wcState.orbitId,
      subName:   wcState.subName,
      priority:  wcState.priority,
      mood:      wcState.mood,
      reflType:  wcState.reflType,
      sowTags:   wcState.sowTags,
      peopleTags: wcState.peopleTags,
    };
    if (draft.note || draft.orbitId) {
      localStorage.setItem(WC_DRAFT_KEY, JSON.stringify(draft));
    }
  }, 500);
}

function checkWcDraft() {
  const raw = localStorage.getItem(WC_DRAFT_KEY);
  if (!raw) return;
  const draft = JSON.parse(raw);
  if (draft.note || draft.orbitId) {
    document.getElementById("wc-draft-banner")?.classList.remove("hidden");
  }
}

function restoreWcDraft() {
  const raw = localStorage.getItem(WC_DRAFT_KEY);
  if (!raw) return;
  const draft = JSON.parse(raw);
  if (draft.date) document.getElementById("wc-date").value = draft.date;
  if (draft.note) document.getElementById("wc-note").value = draft.note;
  if (draft.energy) { document.getElementById("wc-energy").value = draft.energy; document.getElementById("wc-energy-val").textContent = draft.energy; }
  if (draft.progress) { document.getElementById("wc-progress").value = draft.progress; document.getElementById("wc-progress-val").textContent = draft.progress; }
  if (draft.load) { document.getElementById("wc-load").value = draft.load; document.getElementById("wc-load-val").textContent = draft.load; }

  wcState.orbitId    = draft.orbitId || null;
  wcState.subName    = draft.subName || null;
  wcState.priority   = draft.priority || null;
  wcState.mood       = draft.mood || null;
  wcState.reflType   = draft.reflType || null;
  wcState.sowTags    = draft.sowTags || [];
  wcState.peopleTags = draft.peopleTags || [];

  renderOrbits();
  if (wcState.orbitId) {
    const orbit = WORK_ORBITS.find(o => o.id === wcState.orbitId);
    if (orbit) {
      const subsEl = document.getElementById("wc-subs");
      if (subsEl) {
        subsEl.style.display = "flex";
        subsEl.innerHTML = orbit.subs.map(s => `
          <button type="button" class="sub-chip ${s === wcState.subName ? "active" : ""}"
                  onclick="selectSub('${escHtml(s)}')">${escHtml(s)}</button>
        `).join("");
      }
    }
  }

  if (wcState.priority) document.querySelector(`.wc-sel-btn[onclick*="${CSS.escape(wcState.priority)}"]`)?.classList.add("active");
  if (wcState.mood) document.querySelector(`.wc-sel-btn[onclick*="${CSS.escape(wcState.mood)}"]`)?.classList.add("active");
  if (wcState.reflType) document.querySelector(`.wc-sel-btn[onclick*="${CSS.escape(wcState.reflType)}"]`)?.classList.add("active");

  renderSowTags();
  renderPeoplePills();

  document.getElementById("wc-draft-banner")?.classList.add("hidden");
  toast("Draft restored");
}

function clearWcDraft() {
  localStorage.removeItem(WC_DRAFT_KEY);
  document.getElementById("wc-draft-banner")?.classList.add("hidden");
}

document.getElementById("wc-note")?.addEventListener("input", wcSaveDraft);
document.getElementById("wc-date")?.addEventListener("change", wcSaveDraft);

async function submitWorkCapture() {
  const dateVal = document.getElementById("wc-date")?.value || today();
  const note    = document.getElementById("wc-note")?.value?.trim();

  if (!wcState.orbitId) { toast("Pick a category first"); return; }
  if (!note) { toast("Add a note before logging"); return; }

  const orbit    = WORK_ORBITS.find(o => o.id === wcState.orbitId);
  const domain   = orbit ? `${orbit.icon} ${orbit.name}${wcState.subName ? " → " + wcState.subName : ""}` : wcState.orbitId;
  const energy   = document.getElementById("wc-energy")?.value;
  const progress = document.getElementById("wc-progress")?.value;
  const load     = document.getElementById("wc-load")?.value;

  const lines = [note];
  if (wcState.priority)          lines.push(`[priority: ${wcState.priority}]`);
  if (wcState.mood)              lines.push(`[mood: ${wcState.mood}]`);
  if (wcState.reflType)          lines.push(`[type: ${wcState.reflType}]`);
  if (wcState.peopleTags.length) lines.push(`[tags: ${wcState.peopleTags.join(", ")}]`);
  if (wcState.sowTags.length)    lines.push(`[sow: ${wcState.sowTags.join(", ")}]`);
  if (energy || progress || load) lines.push(`[energy:${energy} · progress:${progress} · load:${load}]`);
  const enrichedNote = lines.join("\n");

  const btn = document.getElementById("wc-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const payload = {
    date: dateVal,
    domain,
    reflectionType: wcState.reflType || "",
    note: enrichedNote,
  };

  const localPayload = {
    date: dateVal, domain,
    reflection_type: wcState.reflType,
    note: enrichedNote,
    priority: wcState.priority,
    mood: wcState.mood,
    energy, progress,
    load_complexity: load,
    sow_tags: wcState.sowTags.join(", ") || null,
    people_tags: wcState.peopleTags.join(", ") || null,
    synced: 0,
  };

  let gasOk = false;
  try {
    await Promise.all([
      fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      }).then(() => { gasOk = true; }),
      api("/api/work-capture", "POST", { ...localPayload, synced: 1 }),
    ]);
  } catch (_) {
    await api("/api/work-capture", "POST", localPayload);
  }

  const newStreak = bumpWcStreak();
  renderWcStreak();

  wcSessionLog.unshift({ domain, note, date: dateVal });
  if (wcSessionLog.length > 5) wcSessionLog.pop();
  renderSessionLog();

  clearWcDraft();

  btn.textContent = gasOk ? "✓ Logged!" : "✓ Saved locally";
  btn.classList.add("btn-success");
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Log It →";
    btn.classList.remove("btn-success");
  }, 2500);

  document.getElementById("wc-note").value = "";
  wcState.subName = null;
  document.querySelectorAll("#wc-subs .sub-chip").forEach(c => c.classList.remove("active"));

  toast(gasOk ? `Logged to Sheets · 🔥 ${newStreak}d streak` : "Saved locally — will sync when connected");
}

function renderSessionLog() {
  if (!wcSessionLog.length) return;
  const card = document.getElementById("wc-session-card");
  const list = document.getElementById("wc-session-list");
  if (!card || !list) return;
  card.style.display = "block";
  list.innerHTML = wcSessionLog.map(e => `
    <div class="wc-session-entry">
      <div class="wc-session-domain">${escHtml(e.domain)} · ${fmtDate(e.date)}</div>
      <div class="wc-session-note">${escHtml(e.note)}</div>
    </div>
  `).join("");
}


// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITY  (HOME nav)
// ══════════════════════════════════════════════════════════════════════════════

let activityType = null;
let activityIntensity = null;

function loadActivity() {
  // Form resets on each screen visit if needed — nothing to fetch
}

function actSelectType(val, btn) {
  activityType = val;
  document.querySelectorAll("#act-type-group .toggle-btn").forEach(b =>
    b.classList.toggle("active-yes", b.dataset.val === val)
  );
}

function actSelectIntensity(val, btn) {
  activityIntensity = val;
  document.querySelectorAll("#act-intensity-group .toggle-btn").forEach(b =>
    b.classList.toggle("active-yes", b.dataset.val === val)
  );
}

document.getElementById("activity-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("act-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  const noteStr = [
    activityIntensity ? `[${activityIntensity}]` : "",
    document.getElementById("act-notes").value.trim(),
  ].filter(Boolean).join(" ");

  const result = await api("/api/workouts", "POST", {
    date:             today(),
    type:             activityType || "Other",
    duration_minutes: document.getElementById("act-duration").value || null,
    distance_km:      document.getElementById("act-distance").value || null,
    avg_hr:           document.getElementById("act-hr").value || null,
    notes:            noteStr || null,
  });

  btn.disabled = false;
  btn.textContent = "Log Activity";

  if (result.ok) {
    toast(`Activity logged · +${result.xp} XP`);
    e.target.reset();
    activityType = null;
    activityIntensity = null;
    document.querySelectorAll("#act-type-group .toggle-btn, #act-intensity-group .toggle-btn")
      .forEach(b => b.classList.remove("active-yes"));
    // Close expand section
    document.querySelectorAll("#activity-form .expand-body").forEach(b => b.classList.remove("open"));
    document.querySelectorAll("#activity-form .expand-label").forEach(l => l.textContent = "▼ Add detail");
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// TRAVEL  (HOME nav)
// ══════════════════════════════════════════════════════════════════════════════

let tvPurpose = null;
let tvReimb   = 0;

function tvSelectPurpose(val, btn) {
  tvPurpose = val;
  document.querySelectorAll("#tv-purpose-group .toggle-btn").forEach(b =>
    b.classList.toggle("active-yes", b.dataset.val === val)
  );
}

function tvSelectReimb(val, btn) {
  tvReimb = val;
  document.getElementById("tv-reimb-yes").classList.toggle("active-yes", val === 1);
  document.getElementById("tv-reimb-no").classList.toggle("active-yes",  val === 0);
}

async function loadTravel() {
  const data = await api("/api/travel");
  const list = document.getElementById("travel-list");
  if (!list) return;
  if (!data.entries || !data.entries.length) {
    list.innerHTML = '<div class="empty">No trips logged yet.</div>';
    return;
  }
  list.innerHTML = data.entries.slice(0, 5).map(e => `
    <div class="list-row">
      <div class="main">
        <div class="bold">${escHtml(e.destination)}</div>
        <div class="sub">
          ${fmtDate(e.date)}
          ${e.purpose ? " · " + escHtml(e.purpose) : ""}
          ${e.miles    ? " · " + e.miles + " mi"   : ""}
          ${e.reimbursable ? " · reimbursable" : ""}
          ${e.notes    ? " · " + escHtml(e.notes)  : ""}
        </div>
      </div>
    </div>
  `).join("");
}

document.getElementById("travel-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("tv-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  await api("/api/travel", "POST", {
    date:        today(),
    destination: document.getElementById("tv-destination").value.trim(),
    purpose:     tvPurpose || null,
    miles:       document.getElementById("tv-miles").value || null,
    reimbursable: tvReimb,
    notes:       document.getElementById("tv-notes").value.trim() || null,
  });

  btn.disabled = false;
  btn.textContent = "Log Trip";

  toast("Trip logged");
  e.target.reset();
  tvPurpose = null;
  tvReimb = 0;
  document.querySelectorAll("#tv-purpose-group .toggle-btn").forEach(b => b.classList.remove("active-yes"));
  document.getElementById("tv-reimb-yes").classList.remove("active-yes");
  document.getElementById("tv-reimb-no").classList.remove("active-yes");
  document.querySelectorAll("#travel-form .expand-body").forEach(b => b.classList.remove("open"));
  document.querySelectorAll("#travel-form .expand-label").forEach(l => l.textContent = "▼ Add detail");
  loadTravel();
});


// ══════════════════════════════════════════════════════════════════════════════
// HABITS  (HOME nav)
// ══════════════════════════════════════════════════════════════════════════════

let habitsToState   = { am: 0, pm: 0, eve: 0 };
let habitsWeedState = { am: 0, pm: 0, eve: 0 };

async function loadHabits() {
  const [entry, habitLogs] = await Promise.all([
    api(`/api/log?date=${today()}`),
    api(`/api/habit-log?date=${today()}`),
  ]);

  if (habitLogs && habitLogs.length > 0) {
    const blocks = calcBlocksFromLogs(habitLogs);
    habitsToState   = { am: blocks.tobacco_am, pm: blocks.tobacco_pm, eve: blocks.tobacco_eve };
    habitsWeedState = { am: blocks.weed_am,    pm: blocks.weed_pm,    eve: blocks.weed_eve };
  } else if (entry && entry.date) {
    habitsToState   = { am: entry.tobacco_am, pm: entry.tobacco_pm, eve: entry.tobacco_eve };
    habitsWeedState = { am: entry.weed_am,    pm: entry.weed_pm,    eve: entry.weed_eve };
  } else {
    habitsToState   = { am: 0, pm: 0, eve: 0 };
    habitsWeedState = { am: 0, pm: 0, eve: 0 };
  }

  renderHabitsBlockGrid();
  renderTimeline(habitLogs, "habits-timeline");
}

function renderHabitsBlockGrid() {
  ["am", "pm", "eve"].forEach(block => {
    const tBtn = document.getElementById(`ht-${block}`);
    if (tBtn) renderTobaccoBtn(tBtn, habitsToState[block]);
    const wGroup = document.getElementById(`hw-group-${block}`);
    if (wGroup) renderWeedGroup(wGroup, habitsWeedState[block]);
  });
}

// Wire up habits tobacco buttons
["am", "pm", "eve"].forEach(block => {
  const btn = document.getElementById(`ht-${block}`);
  if (!btn) return;
  btn.addEventListener("click", () => {
    habitsToState[block] = habitsToState[block] === 0 ? 1 : 0;
    renderTobaccoBtn(btn, habitsToState[block]);
  });
});

// Wire up habits weed groups
document.querySelectorAll(".hw-group").forEach(group => {
  const block = group.dataset.block;
  group.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      habitsWeedState[block] = parseInt(btn.dataset.val);
      renderWeedGroup(group, habitsWeedState[block]);
    });
  });
});

document.getElementById("habits-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("habits-submit");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const result = await api("/api/log", "POST", {
    date:        today(),
    tobacco_am:  habitsToState.am,
    tobacco_pm:  habitsToState.pm,
    tobacco_eve: habitsToState.eve,
    weed_am:     habitsWeedState.am,
    weed_pm:     habitsWeedState.pm,
    weed_eve:    habitsWeedState.eve,
  });

  btn.disabled = false;
  btn.textContent = "Save Habits";

  if (result.ok) toast("Habits saved");
});


// ══════════════════════════════════════════════════════════════════════════════
// MONEY  (HOME nav)
// ══════════════════════════════════════════════════════════════════════════════

let msCategory = null;

function msSelectCat(val, btn) {
  msCategory = val;
  document.querySelectorAll("#ms-cat-group .toggle-btn").forEach(b =>
    b.classList.toggle("active-yes", b.dataset.val === val)
  );
}

async function loadMoney() {
  const [statsData, subsData] = await Promise.all([
    api("/api/stats"),
    api("/api/subscriptions"),
  ]);

  // Freedom Fund total
  setEl("money-ff-total", "$" + statsData.freedom_fund.toFixed(2));

  // Debt progress bar
  const pct    = statsData.debt_pct;
  const fillEl = document.getElementById("money-debt-fill");
  if (fillEl) fillEl.style.width = pct + "%";
  setEl("money-debt-saved", "$" + statsData.freedom_fund.toFixed(2) + " saved");
  setEl("money-debt-pct",   pct.toFixed(1) + "%");

  // Subscription Killer list
  const list = document.getElementById("money-subs-list");
  if (list) {
    if (!subsData.entries.length) {
      list.innerHTML = '<div class="empty">No subscriptions tracked.</div>';
    } else {
      list.innerHTML = subsData.entries.map(e => `
        <div class="list-row">
          <div class="main">
            <div class="bold">${escHtml(e.service)}</div>
            <div class="sub">$${e.monthly_cost.toFixed(2)}/mo</div>
          </div>
          <button class="btn btn-sm ${e.kill_it ? "btn-ghost" : "btn-danger"}"
                  onclick="toggleSubKill(${e.id}, ${e.kill_it})">
            ${e.kill_it ? "✓ Killed" : "Kill It"}
          </button>
        </div>
      `).join("");
    }
  }
}

async function toggleSubKill(id, currentKill) {
  const data  = await api("/api/subscriptions");
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return;
  await api(`/api/subscriptions/${id}`, "PUT", {
    service:      entry.service,
    monthly_cost: entry.monthly_cost,
    last_used:    entry.last_used,
    kill_it:      currentKill ? 0 : 1,
    notes:        entry.notes,
  });
  loadMoney();
}

document.getElementById("money-spend-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("ms-submit");
  btn.disabled = true;
  btn.textContent = "Logging…";

  await api("/api/spending", "POST", {
    amount:   parseFloat(document.getElementById("ms-amount").value),
    category: msCategory || "Random",
    merchant: document.getElementById("ms-merchant").value.trim() || "Unknown",
    notes:    document.getElementById("ms-notes").value.trim() || null,
  });

  btn.disabled = false;
  btn.textContent = "Log Spend";

  toast("Spend logged");
  e.target.reset();
  msCategory = null;
  document.querySelectorAll("#ms-cat-group .toggle-btn").forEach(b => b.classList.remove("active-yes"));
  document.querySelectorAll("#money-spend-form .expand-body").forEach(b => b.classList.remove("open"));
  document.querySelectorAll("#money-spend-form .expand-label").forEach(l => l.textContent = "▼ Add detail");
  loadMoney();
});

document.getElementById("money-ff-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("money-ff-amount").value);
  if (!amount || amount <= 0) return;

  await api("/api/freedom-fund", "POST", {
    date:   today(),
    source: "Manual deposit",
    amount,
    notes:  null,
  });

  document.getElementById("money-ff-amount").value = "";
  toast(`$${amount.toFixed(2)} added to Freedom Fund`);
  loadMoney();
});


// ══════════════════════════════════════════════════════════════════════════════
// HOME  (Quick Log)
// ══════════════════════════════════════════════════════════════════════════════

async function loadHome() {
  const data = await api(`/api/quick-log?date=${today()}`);
  const counts = data.counts || {};
  setEl("count-tobacco", counts.tobacco || 0);
  setEl("count-weed",    counts.weed    || 0);
  setEl("count-drink",   counts.drink   || 0);

  const lastEl = document.getElementById("last-logged");
  if (!lastEl) return;
  if (data.last) {
    const ts   = new Date(data.last.timestamp.replace(" ", "T"));
    const time = ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    lastEl.textContent = `Last: ${data.last.type} at ${time}`;
  } else {
    lastEl.textContent = "Nothing logged today";
  }
}

async function quickLog(type) {
  const now       = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace("T", " ");
  const dateStr   = now.toISOString().slice(0, 10);

  const btn = document.querySelector(`.tap-${type}`);
  if (btn) {
    btn.classList.add("tap-pressed");
    setTimeout(() => btn.classList.remove("tap-pressed"), 280);
  }

  const result = await api("/api/quick-log", "POST", {
    type, timestamp, date: dateStr, source: "home_quick_log",
  });

  if (result.ok) {
    const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    toast(`Logged at ${time}`);
    loadHome();
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// PWA INSTALL PROMPT
// ══════════════════════════════════════════════════════════════════════════════

let _installPrompt = null;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  _installPrompt = e;
  const banner = document.getElementById("install-banner");
  if (banner) banner.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  _installPrompt = null;
  const banner = document.getElementById("install-banner");
  if (banner) banner.classList.add("hidden");
});

async function triggerInstall() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  const { outcome } = await _installPrompt.userChoice;
  _installPrompt = null;
  dismissInstall();
}

function dismissInstall() {
  const banner = document.getElementById("install-banner");
  if (banner) banner.classList.add("hidden");
  sessionStorage.setItem("install-dismissed", "1");
}


// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
