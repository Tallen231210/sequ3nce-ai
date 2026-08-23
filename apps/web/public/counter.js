/*!
 * Sequ3nce — live counter
 * Three modes. Two are honest, one is not. Pick deliberately.
 *
 *  mode:"spots"  — counts DOWN against a real cap. Needs { cap, endpoint } where the
 *                  endpoint returns { claimed: 259 }. Strongest and fully defensible
 *                  if the cap is real and the funnel actually stops at it.
 *  mode:"total"  — counts UP to a real number from { endpoint } returning { total: 1284 }.
 *                  Animates between polls, never invents movement.
 *  mode:"tick"   — increments on a timer. Fabricated. Preview only.
 */
(function () {
  "use strict";
  var C = Object.assign({
    mode: "spots",
    cap: 300,
    endpoint: null,
    start: 259,          // used by tick mode only
    tickEvery: 20000,    // ms per +1 in tick mode
    poll: 60000,         // ms between endpoint reads
    anchor: "form",      // insert above the first form on the page
    label: null
  }, window.SP_COUNTER || {});

  var el, barFill, numEl, value = null;

  var CSS = `
  .spc{display:flex;align-items:center;gap:12px;max-width:450px;margin:0 auto 12px;
    background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:11px 14px;
    box-shadow:0 4px 16px rgba(9,9,11,.05);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .spc-dot{width:7px;height:7px;border-radius:50%;background:#10b981;flex:none;position:relative}
  .spc-dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;background:#10b981;opacity:.35;animation:spc-p 2s ease-out infinite}
  @keyframes spc-p{0%{transform:scale(.6);opacity:.5}100%{transform:scale(1.5);opacity:0}}
  .spc-body{flex:1;min-width:0}
  .spc-l1{font-size:13.5px;line-height:1.35;color:#18181b;letter-spacing:-.008em}
  .spc-l1 b{font-weight:650;font-variant-numeric:tabular-nums}
  .spc-l2{font-size:11px;color:#a1a1aa;margin-top:3px}
  .spc-bar{height:5px;border-radius:99px;background:#eeeef0;overflow:hidden;margin-top:7px}
  .spc-fill{height:100%;border-radius:99px;background:#18181b;transition:width .9s cubic-bezier(.16,1,.3,1)}
  .spc-fill.low{background:#e11d48}
  .spc-num{transition:opacity .2s}
  .spc-num.flip{opacity:.25}
  @media (prefers-reduced-motion:reduce){
    .spc-dot::after{animation:none} .spc-fill{transition:none} .spc-num{transition:none}
  }`;

  function mount() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement("div"); el.className = "spc";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = '<span class="spc-dot" aria-hidden="true"></span>' +
      '<div class="spc-body"><div class="spc-l1"></div>' +
      (C.mode === "spots" ? '<div class="spc-bar"><div class="spc-fill"></div></div>' : '<div class="spc-l2"></div>') +
      '</div>';
    var target = document.querySelector(C.anchor);
    var card = target && target.closest("div");
    if (card && card.parentNode) card.parentNode.insertBefore(el, card);
    else document.body.insertBefore(el, document.body.firstChild);
    barFill = el.querySelector(".spc-fill");
  }

  function paint(v) {
    var l1 = el.querySelector(".spc-l1"), l2 = el.querySelector(".spc-l2");
    if (C.mode === "spots") {
      var left = Math.max(0, C.cap - v);
      var pct = Math.min(100, (v / C.cap) * 100);
      l1.innerHTML = '<b class="spc-num">' + left + "</b> of " + C.cap + " sponsored seats left";
      barFill.style.width = pct.toFixed(1) + "%";
      barFill.classList.toggle("low", left <= C.cap * 0.15);
    } else {
      l1.innerHTML = '<b class="spc-num">' + v.toLocaleString() + "</b> " + (C.label || "closers have claimed a seat");
      if (l2) l2.textContent = C.mode === "tick" ? "updating live" : "updated just now";
    }
    var n = el.querySelector(".spc-num");
    if (n) { n.classList.add("flip"); setTimeout(function(){ n.classList.remove("flip"); }, 200); }
  }

  function set(v) {
    if (v === value) return;
    value = v;
    if (!el) mount(); // mount lazily — no element until there's a real number
    paint(v);
  }

  function poll() {
    if (!C.endpoint) return;
    fetch(C.endpoint, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var v = C.mode === "spots" ? d.claimed : d.total;
        if (typeof v === "number") set(v);
      })
      .catch(function () {});
  }

  function init() {
    if (C.mode === "tick") {
      set(C.start);
      setInterval(function () { set(value + 1); }, C.tickEvery);
      return;
    }
    if (!C.endpoint) return; // no real number, show nothing
    poll();
    setInterval(poll, C.poll);
  }

  window.SequenceCounter = { init: init, set: set, config: C };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
