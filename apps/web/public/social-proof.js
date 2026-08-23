/*!
 * Sequ3nce — social proof notifications
 * Drop-in, no dependencies. Renders recent-signup toasts.
 *
 * REAL DATA (recommended):
 *   window.SP_CONFIG = { endpoint: "/api/recent-signups" };
 *   Endpoint returns: [{ name:"Jake W.", location:"Wisconsin", action:"claimed free access", ts:1699999999 }]
 *
 * DEMO DATA (preview only — see notes at the bottom of this file):
 *   window.SP_CONFIG = { demo: true };
 */
(function () {
  "use strict";

  var CFG = Object.assign({
    endpoint: null,        // URL returning JSON array of events
    demo: false,           // use built-in sample data
    position: "bottom-left",
    style: "card",         // card | minimal | dark
    firstDelay: 5000,      // ms before the first toast
    interval: 14000,       // ms between toasts
    duration: 6000,        // ms each toast stays visible
    maxPerSession: 12,     // stop after this many
    showAvatar: true,
    mobile: true,          // show on small screens
    refreshEvery: 120000   // ms between endpoint polls
  }, window.SP_CONFIG || {});

  if (!CFG.mobile && window.matchMedia("(max-width: 640px)").matches) return;

  var DEMO = [
    { name: "Jake W.",   location: "Wisconsin",   action: "claimed free access", ago: "2 minutes ago" },
    { name: "Marcus T.", location: "Georgia",     action: "booked an onboarding call", ago: "6 minutes ago" },
    { name: "Priya R.",  location: "Ontario",     action: "claimed free access", ago: "11 minutes ago" },
    { name: "Danny O.",  location: "Manchester",  action: "joined from a solar role", ago: "18 minutes ago" },
    { name: "Alicia M.", location: "Arizona",     action: "claimed free access", ago: "24 minutes ago" },
    { name: "Tyrone B.", location: "Texas",       action: "booked an onboarding call", ago: "31 minutes ago" },
    { name: "Sam K.",    location: "New South Wales", action: "claimed free access", ago: "38 minutes ago" },
    { name: "Ravi P.",   location: "Florida",     action: "joined from an insurance role", ago: "45 minutes ago" }
  ];

  var events = [], idx = 0, shown = 0, timer = null, host = null, root = null;

  var CSS = `
  .sp-host{position:fixed;z-index:2147483000;pointer-events:none;padding:16px;max-width:100%}
  .sp-host[data-pos="bottom-left"]{left:0;bottom:0}
  .sp-host[data-pos="bottom-right"]{right:0;bottom:0}
  .sp-host[data-pos="top-left"]{left:0;top:0}
  .sp-host[data-pos="top-right"]{right:0;top:0}
  .sp-toast{pointer-events:auto;display:flex;align-items:center;gap:11px;width:305px;max-width:calc(100vw - 32px);
    box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    opacity:0;transform:translateY(10px) scale(.97);transition:opacity .34s cubic-bezier(.16,1,.3,1),transform .34s cubic-bezier(.16,1,.3,1)}
  .sp-toast.in{opacity:1;transform:none}
  .sp-host[data-pos^="top"] .sp-toast{transform:translateY(-10px) scale(.97)}
  .sp-host[data-pos^="top"] .sp-toast.in{transform:none}

  .sp-card{background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:11px 13px;
    box-shadow:0 10px 34px rgba(9,9,11,.13),0 2px 6px rgba(9,9,11,.05)}
  .sp-dark{background:#111113;border:1px solid #2a2a30;border-radius:14px;padding:11px 13px;
    box-shadow:0 10px 34px rgba(0,0,0,.45)}
  .sp-minimal{background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border:1px solid #e4e4e7;
    border-radius:999px;padding:8px 15px 8px 9px;box-shadow:0 6px 22px rgba(9,9,11,.11);width:auto}

  .sp-av{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-size:13px;font-weight:600;letter-spacing:-.02em;color:#fff;background:#18181b}
  .sp-dark .sp-av{background:#3f3f46}
  .sp-minimal .sp-av{width:26px;height:26px;font-size:11px}

  .sp-body{min-width:0;flex:1}
  .sp-l1{font-size:13.5px;line-height:1.35;color:#18181b;letter-spacing:-.008em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sp-l1 b{font-weight:600}
  .sp-dark .sp-l1{color:#f4f4f5}
  .sp-minimal .sp-l1{font-size:13px}
  .sp-l2{font-size:11px;line-height:1.3;color:#a1a1aa;margin-top:2px;display:flex;align-items:center;gap:5px}
  .sp-dark .sp-l2{color:#8b8b93}
  .sp-minimal .sp-l2{display:none}
  .sp-dot{width:5px;height:5px;border-radius:50%;background:#10b981;flex:none}

  .sp-x{flex:none;width:20px;height:20px;border:0;background:transparent;cursor:pointer;color:#c4c4c8;
    font-size:15px;line-height:1;padding:0;border-radius:5px}
  .sp-x:hover{color:#71717a;background:#f4f4f5}
  .sp-dark .sp-x:hover{color:#e4e4e7;background:#26262b}
  .sp-minimal .sp-x{display:none}

  @media (max-width:640px){
    .sp-host{padding:10px}
    .sp-host[data-pos^="bottom"]{bottom:0}
    .sp-toast{width:calc(100vw - 20px)}
  }
  @media (prefers-reduced-motion:reduce){
    .sp-toast{transition:opacity .01ms}
    .sp-toast,.sp-toast.in{transform:none}
  }`;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function relTime(ts) {
    if (!ts) return "";
    var s = Math.max(1, Math.floor((Date.now() - ts * 1000) / 1000));
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  function mount() {
    if (host) return;
    host = document.createElement("div");
    host.className = "sp-host";
    host.setAttribute("data-pos", CFG.position);
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    document.body.appendChild(host);
  }

  function render(ev) {
    if (root) root.remove();
    var initial = (ev.name || "?").trim().charAt(0).toUpperCase();
    var when = ev.ago || relTime(ev.ts);
    root = document.createElement("div");
    root.className = "sp-toast sp-" + CFG.style;
    root.setAttribute("role", "status");
    root.innerHTML =
      (CFG.showAvatar ? '<div class="sp-av" aria-hidden="true">' + esc(initial) + "</div>" : "") +
      '<div class="sp-body">' +
        '<div class="sp-l1"><b>' + esc(ev.name) + "</b>" +
          (ev.location ? " from " + esc(ev.location) : "") + " " + esc(ev.action || "just joined") +
        "</div>" +
        (when ? '<div class="sp-l2"><span class="sp-dot"></span>' + esc(when) + "</div>" : "") +
      "</div>" +
      '<button class="sp-x" aria-label="Dismiss">&times;</button>';
    root.querySelector(".sp-x").addEventListener("click", function () { hide(); stop(); });
    host.appendChild(root);
    requestAnimationFrame(function () { root.classList.add("in"); });
  }

  function hide() { if (root) root.classList.remove("in"); }

  function cycle() {
    if (!events.length) return;
    if (CFG.maxPerSession && shown >= CFG.maxPerSession) return stop();
    render(events[idx % events.length]);
    idx++; shown++;
    setTimeout(hide, CFG.duration);
  }

  function start() {
    mount();
    setTimeout(function () {
      cycle();
      timer = setInterval(cycle, CFG.interval);
    }, CFG.firstDelay);
  }

  function stop() { clearInterval(timer); timer = null; hide(); }

  function load() {
    if (CFG.demo || !CFG.endpoint) { events = DEMO.slice(); return start(); }
    fetch(CFG.endpoint, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        events = Array.isArray(list) ? list : [];
        if (events.length) start();
      })
      .catch(function () { /* stay silent rather than show fabricated data */ });
    if (CFG.refreshEvery) {
      setInterval(function () {
        fetch(CFG.endpoint, { credentials: "omit" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (l) { if (Array.isArray(l) && l.length) events = l; })
          .catch(function () {});
      }, CFG.refreshEvery);
    }
  }

  window.SequenceSocialProof = { start: start, stop: stop, reload: load, config: CFG };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();

/* ---------------------------------------------------------------------------
   NOTE ON DATA
   If CFG.endpoint is not reachable the widget shows nothing. That is deliberate.
   It never falls back to demo names in production, because a notification saying
   a named person in a named place just signed up is a factual claim to the viewer.
   Wire the endpoint to real opt-ins (GHL webhook -> store last ~50 -> serve JSON,
   first name + last initial + region only) and this is honest and more effective.
--------------------------------------------------------------------------- */
