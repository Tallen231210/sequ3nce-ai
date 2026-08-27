/*!
 * Sequ3nce — urgency bar + sponsored-seats counter (adapted from the
 * co-founder's funnel-v6 widget).
 *
 * TIMER: "cohort" counts down to a real fixed date we control. With no
 * deadline configured it renders nothing. The "evergreen" per-visitor mode
 * from the original file is deliberately NOT ported — it fabricates urgency
 * and resets in a private window, which is how people catch it.
 *
 * SEATS: renders "N of CAP sponsored seats left" above each page CTA.
 * claimed comes from a real endpoint ({claimed} or our lead-count {count}).
 * No endpoint or no number → renders nothing rather than inventing one.
 */
(function () {
  "use strict";
  var C = Object.assign(
    {
      deadline: null, // ISO date for the cohort bar; null = no bar
      cap: null, // real seat cap; null = no seats card
      claimed: null, // demo override (preview only)
      endpoint: null,
      label: "Next live session starts",
    },
    window.SP_URGENCY || {},
  );

  var CSS = `
  .u-bar{position:sticky;top:0;z-index:800;background:#09090b;color:#fff;padding:9px 16px;
    display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;letter-spacing:-.005em}
  .u-bar b{font-weight:600}
  .u-clock{display:inline-flex;gap:5px;align-items:center;font-variant-numeric:tabular-nums}
  .u-seg{background:#26262b;border-radius:6px;padding:3px 7px;font-weight:650;font-size:13.5px;min-width:30px;text-align:center}
  .u-seg small{display:block;font-size:8.5px;font-weight:500;color:#8b8b93;letter-spacing:.08em;text-transform:uppercase;margin-top:1px}
  .u-done{color:#fbbf24;font-weight:600}
  @media(max-width:520px){.u-bar{font-size:12px;padding:8px 12px;gap:8px}.u-seg{padding:2px 6px;font-size:12.5px;min-width:27px}}

  .u-seats{display:flex;align-items:center;gap:11px;max-width:450px;margin:0 auto 12px;background:#fff;
    border:1px solid #e4e4e7;border-radius:14px;padding:11px 14px;box-shadow:0 4px 16px rgba(9,9,11,.05);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .u-dot{width:7px;height:7px;border-radius:50%;background:#10b981;flex:none;position:relative}
  .u-dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;background:#10b981;opacity:.35;animation:u-p 2s ease-out infinite}
  @keyframes u-p{0%{transform:scale(.6);opacity:.5}100%{transform:scale(1.5);opacity:0}}
  .u-body{flex:1;min-width:0}
  .u-l1{font-size:13.5px;color:#18181b;letter-spacing:-.008em}
  .u-l1 b{font-weight:650;font-variant-numeric:tabular-nums}
  .u-track{height:5px;border-radius:99px;background:#eeeef0;overflow:hidden;margin-top:7px}
  .u-fill{height:100%;border-radius:99px;background:#18181b;transition:width .9s cubic-bezier(.16,1,.3,1)}
  .u-fill.low{background:#e11d48}
  @media(prefers-reduced-motion:reduce){.u-dot::after{animation:none}.u-fill{transition:none}}`;

  var iv = null;

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function seg(v, l) { return '<span class="u-seg">' + pad(v) + "<small>" + l + "</small></span>"; }

  function mountBar() {
    if (!C.deadline) return; // no real date, no bar
    var end = new Date(C.deadline).getTime();
    if (!isFinite(end)) return;
    var bar = document.createElement("div");
    bar.className = "u-bar";
    bar.setAttribute("role", "status");
    document.body.insertBefore(bar, document.body.firstChild);
    function tick() {
      var ms = end - Date.now();
      if (ms <= 0) {
        bar.innerHTML = '<span class="u-done">This session has started &mdash; book in for the next one</span>';
        clearInterval(iv);
        return;
      }
      var s = Math.floor(ms / 1000), d = Math.floor(s / 86400),
        h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      bar.innerHTML = "<b>" + C.label + '</b><span class="u-clock">' +
        (d > 0 ? seg(d, "days") : "") + seg(h, "hrs") + seg(m, "min") + seg(ss, "sec") + "</span>";
    }
    tick();
    iv = setInterval(tick, 1000);
  }

  function mountSeats(claimed) {
    if (typeof C.cap !== "number" || C.cap <= 0) return;
    var left = Math.max(0, C.cap - claimed);
    var pct = Math.min(100, (claimed / C.cap) * 100);
    // The hero CTA only — one counter per page. ([data-open] excludes the
    // modal's submit button.)
    var btn = document.querySelector(".mj-cta[data-open]");
    if (!btn) return;
    var el = document.createElement("div");
    el.className = "u-seats";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = '<span class="u-dot" aria-hidden="true"></span><div class="u-body">' +
      '<div class="u-l1"><b>' + left + "</b> of " + C.cap + " sponsored seats left</div>" +
      '<div class="u-track"><div class="u-fill' + (left <= C.cap * 0.15 ? " low" : "") + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      "</div>";
    btn.parentNode.insertBefore(el, btn);
  }

  var styleTag = null;
  function init() {
    styleTag = document.createElement("style");
    styleTag.textContent = CSS;
    document.head.appendChild(styleTag);
    mountBar();
    if (typeof C.claimed === "number") return mountSeats(C.claimed);
    if (!C.endpoint) return; // no real number, render nothing
    fetch(C.endpoint, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var n = d && (typeof d.claimed === "number" ? d.claimed : d.count);
        if (typeof n === "number") mountSeats(n);
      })
      .catch(function () {});
  }

  function stop() {
    if (iv) clearInterval(iv);
    document.querySelectorAll(".u-bar, .u-seats").forEach(function (el) { el.remove(); });
    if (styleTag) styleTag.remove();
  }

  window.SequenceUrgency = { init: init, stop: stop, config: C };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
