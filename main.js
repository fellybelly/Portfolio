/* ════════════════════════════════════════════════════════════
   Felicia Tan — portfolio · main.js  (classic script, runs over file://)

   Sections: Lenis smooth-scroll (dynamic import, graceful) · reveals · typed
   greeting · hero showcase over SIX 2D-canvas plates across three research
   areas (neural ODE / fluidised bed · CFD / computer-aided formulation /
   interlocking rings / hyperspectral quantification / lactic-acid fermenter —
   shared with the pinned research section) ·
   per-diagram pause+restart · section settle-snap ·
   pointer-reactive atmosphere · mobile menu. No build step, no framework; all
   CDN deps are dynamic imports in try/catch so an offline load never blanks
   the page. See CLAUDE.md for the architecture + the load-bearing decisions.
   ════════════════════════════════════════════════════════════ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;

const reduced  = matchMedia("(prefers-reduced-motion:reduce)").matches;
const canHover = matchMedia("(hover:hover) and (pointer:fine)").matches;

/* themes — one accent pair per research AREA (three areas) */
const THEMES = {
  ml:    { t1: "#2b5fd0", t2: "#39b8c9" },
  poly:  { t1: "#7a3ff0", t2: "#d044a8" },
  waste: { t1: "#2e7d4f", t2: "#9bbf3b" },
};
const ORDER = ["ml", "poly", "waste"];

/* SIX figures across those three areas — the canonical index↔figure mapping used
   by the hero carousel, the research chapters and the sheet's figure numbering.
   `viz` is the renderer key (see createRenderers), `fig` the plate number, and
   `area` the theme/tab this figure belongs to. ML carries THREE figures and Waste
   two, which is why the hero cycles six plates but shows only three topic tabs.
   Figure order here IS chapter order — the `.rxt` articles in index.html must
   match it one for one, and the six `.scs__seg` buttons with them. */
const FIGS = [
  { viz: "node",  area: "ml",    label: "Physics-informed Neural ODE",  fig: "01" },
  { viz: "fbed",  area: "ml",    label: "Computational Fluid Dynamics", fig: "02" },
  { viz: "cadf",  area: "ml",    label: "Computer-aided Formulation",   fig: "03" },
  { viz: "rings", area: "poly",  label: "Polymer Hydrodynamics",        fig: "04" },
  { viz: "hyper", area: "waste", label: "Hyperspectral Sorting",        fig: "05" },
  { viz: "ferm",  area: "waste", label: "Food-Waste Valorisation",      fig: "06" },
];
/* first figure of each area — what a topic tab/button jumps to */
const AREA_START = ORDER.map((a) => FIGS.findIndex((f) => f.area === a));

function setTheme(key) {
  const t = THEMES[key], s = document.documentElement.style;
  s.setProperty("--t1", t.t1);  // registered → crossfades on small accents
  s.setProperty("--t2", t.t2);
  s.setProperty("--w1", t.t1);  // plain → the big atmosphere gradients snap (no per-frame raster)
  s.setProperty("--w2", t.t2);
}

/* ─────────────────────────────────────────────────────────────
   LENIS smooth scroll (graceful fallback to native)
   ───────────────────────────────────────────────────────────── */
let lenis = null, scrollTo = (y) => window.scrollTo({ top: y, behavior: "smooth" });

async function initLenis() {
  if (reduced) return bindAnchors();
  // current-generation engine, with a second CDN so smoothness doesn't hinge
  // on one host being reachable; native scroll remains the final fallback
  const CDNS = [
    "https://unpkg.com/lenis@1/dist/lenis.mjs",
    "https://cdn.jsdelivr.net/npm/lenis@1/dist/lenis.mjs",
  ];
  const easing = (t) => 1 - Math.pow(1 - t, 4);   // quartic-out: settles cleanly, no tail-end crawl
  for (const url of CDNS) {
    try {
      const mod = await import(url);
      const Lenis = mod.default || mod.Lenis;
      lenis = new Lenis({ duration: 1.05, smoothWheel: true, wheelMultiplier: 1,
        touchMultiplier: 1.4, easing });
      break;
    } catch (e) { /* try the next CDN */ }
  }
  if (lenis) {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    lenis.on("scroll", onScroll);
    scrollTo = (y) => lenis.scrollTo(y, { duration: 1.1, easing });
  }
  bindAnchors();
}
function bindAnchors() {
  $$("[data-link]").forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (!id || !id.startsWith("#")) return;
    const el = $(id); if (!el) return;
    e.preventDefault();
    programmaticScroll(el.getBoundingClientRect().top + window.scrollY);
  }));
}

/* ─────────────────────────────────────────────────────────────
   REVEAL ON SCROLL
   ───────────────────────────────────────────────────────────── */
let revealPending = [];
const inView = (e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight * 0.92 && r.bottom > 0; };
// Driven by the scroll handler (which reliably fires) rather than only an
// IntersectionObserver, so content can never stay stuck hidden.
function revealCheck() {
  if (!revealPending.length) return;
  revealPending = revealPending.filter((e) => {
    if (inView(e)) { e.classList.add("is-in"); return false; }
    return true;
  });
}
function initReveals() {
  if (reduced) return;                       // leave everything visible
  // Only animate what's BELOW the fold; on-screen content stays plainly visible.
  $$(".reveal").forEach((e) => { if (!inView(e)) { e.classList.add("will-reveal"); revealPending.push(e); } });
  revealCheck();
}

/* ─────────────────────────────────────────────────────────────
   NAV / PROGRESS / ACTIVE LINK  (driven by onScroll)
   ───────────────────────────────────────────────────────────── */
const nav = $("#nav"), progressFill = $("#progressFill");
const navLinks = $$(".nav__links a");
const sections = ["home", "about", "research", "work", "awards"].map((id) => $("#" + id));
let prevY = 0, scrollDir = 1;

/* gentle section "settle" — after scrolling stops, if we've travelled MOST of
   the way to the next boundary (in our direction of travel), ease onto it. It
   only completes a nearly-finished transition, so it never reverses a deliberate
   partial scroll and the tall research story still scrolls freely. */
let snapTimer = null, snapLock = false;
function scheduleSnap() {
  if (!canHover || reduced) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(snapSettle, 80);
}
function snapSettle() {
  if (snapLock) return;
  const y = window.scrollY, vh = innerHeight;
  const tops = sections.filter(Boolean).map((s) => s.offsetTop).sort((a, b) => a - b);
  let target = null;
  if (scrollDir >= 0) { target = tops.find((tp) => tp > y + 2); }         // next boundary ahead
  else { for (const tp of tops) if (tp < y - 2) target = tp; }             // last boundary behind
  if (target == null) return;
  const d = Math.abs(target - y);
  if (d > 2 && d < vh * 0.4) {                      // fit the section into view…
    snapLock = true;
    if (lenis) {
      // lock:true still holds scroll for the fit so the section "sits" in view,
      // but the whole move is SHORT (.5s, expo-out) and released the moment it
      // lands — the old 1s fit + 260ms dwell read as the page refusing input
      lenis.scrollTo(target, { duration: 0.5, lock: true,
        easing: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -9 * k)),
        onComplete: () => { snapLock = false; } });
    } else {
      scrollTo(target);
      setTimeout(() => { snapLock = false; }, 520);
    }
  }
}

/* scroll triggered by a click (nav link / research tab). Suppress the settle-snap
   for its duration so it can't fire a SECOND competing scroll mid-way — that
   double-scroll was the lag/jank when clicking the topic buttons. */
let snapRelease = null;
function programmaticScroll(y) {
  snapLock = true;
  clearTimeout(snapRelease);
  snapRelease = setTimeout(() => { snapLock = false; }, 900);
  scrollTo(y);
}

/* the right-edge sheet scale — one tick per section, built here so a JS failure
   simply leaves it out (it is decoration + orientation, never navigation) */
let scaleTicks = [];
function initScale() {
  const el = document.createElement("div");
  el.id = "scale"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = sections.filter(Boolean).map((s, i) =>
    '<span class="scale__t"><em>0' + (i + 1) + '</em><i></i></span>').join("");
  document.body.appendChild(el);
  scaleTicks = $$(".scale__t", el);
}

let activeId = "";
function onScroll() {
  const y = window.scrollY;
  nav.classList.toggle("is-scrolled", y > 30);
  const docH = document.documentElement.scrollHeight - innerHeight;
  progressFill.style.transform = "scaleX(" + clamp(y / Math.max(1, docH), 0, 1).toFixed(4) + ")";

  // active section — the one crossing 38% of the viewport. Only touch the DOM
  // when it actually CHANGES; this runs on every smooth-scroll frame.
  const mark = y + innerHeight * 0.38;
  let active = sections[0], idx = 0;
  sections.forEach((s, i) => { if (s && s.offsetTop <= mark) { active = s; idx = i; } });
  if (active.id !== activeId) {
    activeId = active.id;
    navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + active.id));
    scaleTicks.forEach((tk, i) => tk.classList.toggle("is-on", i === idx));
  }

  revealCheck();
  updateResearch(y);

  scrollDir = y > prevY ? 1 : y < prevY ? -1 : scrollDir;
  prevY = y;
  scheduleSnap();
}

/* ─────────────────────────────────────────────────────────────
   HERO — auto-cycling showcase + viz crossfade
   ───────────────────────────────────────────────────────────── */
let stage = 0, showcaseTimer = null;
/* set by initHeroViz: draw a single frame of the active hero diagram, and report
   whether the hero diagram is paused (a paused figure shouldn't be cycled away
   from — the visitor paused it to look at it) */
let heroDrawOnce = null, heroIsPaused = () => false, cycleHold = null;
function initShowcase() {
  const hero = $("#home"), segs = $$(".scs__seg"), labs = $$(".scs__lab");
  const ixs = $$(".ix"), vizLabel = $("#vizLabel"), vizFig = $("#vizFig");
  const vizCanvases = $$(".vz");

  // the carousel steps through all SIX figures. One segment per figure is lit,
  // and the topic LABEL for the area it belongs to lights with it — so an area
  // with two plates simply holds its label across both of them. Segments and
  // labels are separate rows (six equal / three groups), so neither constrains
  // the other's spacing.
  function go(i, manual) {
    stage = (i + FIGS.length) % FIGS.length;
    const f = FIGS[stage], area = f.area, ai = ORDER.indexOf(area);
    segs.forEach((d, k) => d.classList.toggle("is-active", k === stage));
    labs.forEach((g, k) => g.classList.toggle("is-active", k === ai));
    bar(stage);
    ixs.forEach((b) => b.classList.toggle("is-active", b.dataset.ix === area));
    vizCanvases.forEach((c) => c.classList.toggle("is-active", c.dataset.viz === f.viz));
    hero.dataset.tone = area;
    vizLabel.textContent = f.label;
    if (vizFig) vizFig.textContent = "FIG · " + f.fig;   // figure number tracks the plate
    setTheme(area);
    activeViz = f.viz;
    if (heroDrawOnce) heroDrawOnce();      // paused or not, the new canvas gets a frame
    if (manual) restart();
  }
  // restart ONLY the active dot's fill bar (one forced reflow, not three)
  // restart the active dot's fill — the travelling cursor + limit tick are drawn
  // off this same element, so one reflow re-runs the whole countdown
  // restart ONLY the live segment's cursor (one forced reflow, not six)
  function bar(i) {
    const d = segs[i == null ? stage : i];
    const f = d && d.querySelector("i");
    if (f) { f.style.animation = "none"; void f.offsetWidth; f.style.animation = ""; }
  }
  function next() { if (!heroIsPaused()) go(stage + 1); }
  function restart() { clearInterval(showcaseTimer); showcaseTimer = setInterval(next, 5000); }

  // a segment goes straight to its own figure; the inline interest links still
  // jump to the FIRST plate of their area
  segs.forEach((d) => d.addEventListener("click", () => go(+d.dataset.fig, true)));
  ixs.forEach((b) => b.addEventListener("click", () => go(AREA_START[ORDER.indexOf(b.dataset.ix)], true)));
  // re-arm the timer AND the fill bar together — the bar is a countdown to the
  // next figure, so it must never keep running from an older start time
  cycleHold = () => { bar(); restart(); };
  go(0); restart();
}

/* ─────────────────────────────────────────────────────────────
   DIAGRAM PLAYBACK CONTROLS — a pause/resume + restart pair in the bottom-left
   margin of each figure frame. The figure is a simulation, so being able to stop
   it and look, or start it over, is a real affordance rather than decoration.
   ───────────────────────────────────────────────────────────── */
function initVizControls(frame, api) {
  if (!frame) return;
  const wrap = document.createElement("div");
  wrap.className = "vizctl";
  wrap.innerHTML =
    '<button class="vizctl__b" data-act="toggle" type="button" aria-pressed="false">' +
      '<span class="vizctl__i vizctl__i--pause" aria-hidden="true"><i></i><i></i></span>' +
      '<span class="vizctl__i vizctl__i--play" aria-hidden="true"></span>' +
    '</button>' +
    '<button class="vizctl__b" data-act="restart" type="button" aria-label="Restart diagram">' +
      '<span class="vizctl__i vizctl__i--restart" aria-hidden="true"></span>' +
    '</button>';
  const toggle = wrap.querySelector('[data-act="toggle"]');
  const sync = () => {
    const p = api.paused();
    frame.classList.toggle("is-paused", p);
    toggle.setAttribute("aria-pressed", p ? "true" : "false");
    toggle.setAttribute("aria-label", p ? "Resume diagram" : "Pause diagram");
    toggle.title = p ? "Resume" : "Pause";
  };
  toggle.addEventListener("click", () => { api.toggle(); sync(); });
  wrap.querySelector('[data-act="restart"]').addEventListener("click", () => { api.restart(); sync(); });
  frame.appendChild(wrap);
  sync();
}

/* ─────────────────────────────────────────────────────────────
   2D VISUAL RENDERERS — shared by the hero and the research section. SIX figures
   across the three research areas:
     ml    → node (neural ODE) + fbed (fluidised bed · CFD) + cadf (formulation)
     poly  → rings (interlocking rings)
     waste → hyper (hyperspectral quantification) + ferm (lactic-acid fermenter)
   Each call returns a fresh set with independent state, so the hero and research
   canvases run the same visuals separately.
   ───────────────────────────────────────────────────────────── */
function createRenderers(DPR) {
  const INKA = (a) => `rgba(24,23,18,${a})`;
  const mono = (ctx, px) => (ctx.font = `${px * DPR}px "JetBrains Mono",monospace`);
  const rnd = Math.random;
  const TAU = 6.283185307;
  const PAPER = "#faf9f6";
  // every renderer registers how to re-seed itself, so the RESTART control can
  // put the whole figure back to its opening state
  const resets = [];
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };

  // a hairline rule that a label sits ON, with the line erased behind the text
  // (destination-out, so the page shows through instead of an opaque patch) —
  // the way a real drawing sheet partitions one plate into registers
  const rule = (ctx, x0, x1, y, label, px) => {
    ctx.strokeStyle = INKA(.13); ctx.lineWidth = 1 * DPR;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    if (!label) return;
    mono(ctx, px || 7.4);
    const wd = ctx.measureText(label).width, cx = (x0 + x1) / 2;
    ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000";
    ctx.fillRect(cx - wd / 2 - 6 * DPR, y - 6 * DPR, wd + 12 * DPR, 12 * DPR);
    ctx.restore();
    ctx.fillStyle = INKA(.4); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx, y); ctx.textBaseline = "alphabetic";
  };
  // an arrowhead at (x,y) pointing along `ang` — every figure on the sheet uses
  // the same head so dimension lines, flux arrows and flow arrows read as one set
  const head = (ctx, x, y, ang, sz) => {
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang - .4) * sz, y - Math.sin(ang - .4) * sz);
    ctx.lineTo(x, y);
    ctx.lineTo(x - Math.cos(ang + .4) * sz, y - Math.sin(ang + .4) * sz);
    ctx.stroke();
  };
  // a dimension line with extension ticks and a gap for its own label
  const dim = (ctx, x0, y0, x1, y1, label) => {
    const ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
    mono(ctx, 7.4); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const gap = ctx.measureText(label).width / 2 + 6 * DPR;
    const L = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(mx - ux * gap, my - uy * gap);
    ctx.moveTo(mx + ux * gap, my + uy * gap); ctx.lineTo(x1, y1);
    ctx.moveTo(x0 - nx * 5 * DPR, y0 - ny * 5 * DPR); ctx.lineTo(x0 + nx * 5 * DPR, y0 + ny * 5 * DPR);
    ctx.moveTo(x1 - nx * 5 * DPR, y1 - ny * 5 * DPR); ctx.lineTo(x1 + nx * 5 * DPR, y1 + ny * 5 * DPR);
    ctx.stroke();
    if (L > 24 * DPR) { head(ctx, x0, y0, ang + Math.PI, 4 * DPR); head(ctx, x1, y1, ang, 4 * DPR); }
    ctx.fillStyle = INKA(.45); ctx.fillText(label, mx, my);
    ctx.textBaseline = "alphabetic";
  };

    /* Every plate closes with the SAME two-line footer, drawn here so the caveat
     and the notes strip can never drift apart between figures:
       † RESULTS SHOWN ARE HYPOTHETICAL …  Felicia asked for this on EVERY figure,
         not just the one that first carried it. It is a requirement.
       NOTES: …                            the figure's own keywords.
     Both sit at fixed fractions of the plate and only in the full (non-compact)
     layout. NOTHING may be drawn below h*.90 or it collides with the caveat. */
  const HYPO = "† RESULTS SHOWN ARE HYPOTHETICAL — ILLUSTRATIVE TRENDS, NOT MEASURED DATA";
  const notes = (ctx, w, h, keywords) => {
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    mono(ctx, 6.2); ctx.fillStyle = INKA(.38);
    ctx.fillText(HYPO, w / 2, h * .932);
    mono(ctx, 6.8); ctx.fillStyle = INKA(.32);
    ctx.fillText("NOTES:  " + keywords, w / 2, h * .974);
  };

    /* The centre-scaling wrapper four of the six plates share. The scale is applied
     to the TRANSFORM, not to every coordinate, so margins, type and line weights
     stay in proportion — that is the whole reason it exists.
       sc    how far to scale the drawing down
       pre   advances the simulation and returns the body's 4th argument (usually
             `t`; `cadf` hands its body a loop phase). null for a stateless plate.
       body  the drawing itself, in unscaled plate coordinates. */
  const plate = (sc, pre, body) => (ctx, w, h, t) => {
    const arg = pre ? pre(t) : t;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
    body(ctx, w, h, arg);
    ctx.restore();
  };

  /* ══ 01 · NEURAL ODE ═══════════════════════════════════════════════════════
     Stripped back to ONE register at Felicia's request: the dynamics network
     f(h,t,θ) alone, filling the plate, with an activation wave sweeping
     input→output so the neurons and the connections between them light up in
     turn as information passes through. The continuous-depth trajectory field
     and the solver step-size bars were removed, as was the adjoint line.
     What makes it a neural ODE rather than a plain net is still stated: the
     network's output IS dh/dt, fed straight back into its own input, and the
     state is recovered by integrating it. ══ */
  const node = (() => {
    const F = [3, 6, 6, 6, 3], L = F.length, MX = 6;
    const IN = ["h", "t", "θ"], OUT = ["dh", "/dt", ""];
    let fn = null, edges = null;
    const build = () => {
      fn = [];
      F.forEach((n, li) => { const lx = li / (L - 1), sp = (n - 1) / (MX - 1);
        for (let i = 0; i < n; i++)
          fn.push({ x: lx, y: .5 - sp / 2 + (n === 1 ? 0 : sp * i / (n - 1)), l: li }); });
      edges = []; let base = 0;
      for (let li = 0; li < L - 1; li++) {
        for (let a = 0; a < F[li]; a++) for (let b = 0; b < F[li + 1]; b++)
          edges.push({ a: base + a, b: base + F[li] + b, l: li, w: .35 + rnd() * .65 });
        base += F[li];
      }
    };
    resets.push(() => { fn = null; });
    const SC = .92;
    const body = (ctx, w, h, t) => {
      if (!fn) build();
      const compact = Math.min(w, h) / DPR < 340;
      // the network is the whole plate now, so it gets the whole plate
      const nx0 = w * (compact ? .18 : .20), nx1 = w * (compact ? .82 : .80);
      const ny0 = h * (compact ? .18 : .17), ny1 = h * (compact ? .80 : .70);
      const X = (u) => nx0 + u * (nx1 - nx0), Y = (v) => ny0 + v * (ny1 - ny0);
      // ONE slow wave crossing the stack — deliberately unhurried (a 5.2s pass),
      // because the point is watching the signal travel, not a strobe
      const P = 5.2, s = ((t % P) / P) * (L + 1.1) - .55;
      const act = (l) => Math.exp(-((s - l) ** 2) / .38);
      ctx.lineCap = "round";

      // every connection — one faint batched pass, the resting network
      ctx.strokeStyle = "rgba(24,23,18,.075)"; ctx.lineWidth = .9 * DPR;
      ctx.beginPath();
      for (const e of edges) { const a = fn[e.a], b = fn[e.b];
        ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); }
      ctx.stroke();
      // the connections the wave is currently crossing, lit and weighted. Each
      // edge lights on the half-step between its two layers, so the signal
      // visibly moves neuron → connection → neuron rather than blinking.
      for (const e of edges) {
        const g = act(e.l + .5) * e.w;
        if (g < .05) continue;
        const a = fn[e.a], b = fn[e.b];
        ctx.strokeStyle = `rgba(43,95,208,${Math.min(.6, g).toFixed(3)})`;
        ctx.lineWidth = (.7 + g * 1.7) * DPR;
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      }
      // the halo a lit neuron carries, then the neuron itself over it
      for (const nd of fn) { const a = act(nd.l);
        if (a > .04) { ctx.fillStyle = `rgba(57,184,201,${(a * .3).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(X(nd.x), Y(nd.y), (8 + a * 8) * DPR, 0, TAU); ctx.fill(); } }
      for (const nd of fn) { const a = act(nd.l), r = (4.8 + a * 1.8) * DPR;
        ctx.fillStyle = a > .3 ? `rgba(43,95,208,${(.1 + a * .28).toFixed(3)})` : PAPER;
        ctx.beginPath(); ctx.arc(X(nd.x), Y(nd.y), r, 0, TAU); ctx.fill();
        ctx.strokeStyle = a > .3 ? "#2b5fd0" : INKA(.5); ctx.lineWidth = 1.35 * DPR;
        ctx.beginPath(); ctx.arc(X(nd.x), Y(nd.y), r, 0, TAU); ctx.stroke();
      }
      if (compact) return;

      // what goes in, and what comes out — the output IS the derivative
      mono(ctx, 8.6); ctx.textBaseline = "middle"; ctx.fillStyle = INKA(.55);
      ctx.textAlign = "right";
      IN.forEach((k, i) => ctx.fillText(k, X(0) - 13 * DPR, Y(fn[i].y)));
      ctx.textAlign = "left";
      const on = fn.length - 3;
      mono(ctx, 8.6);
      const ox = X(1) + 13 * DPR, ow = ctx.measureText("dh").width;
      ctx.fillText("dh", ox, Y(fn[on].y));
      ctx.fillText("dt", ox, Y(fn[on + 2].y));
      ctx.strokeStyle = INKA(.4); ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(ox, Y(fn[on + 1].y)); ctx.lineTo(ox + ow, Y(fn[on + 1].y));
      ctx.stroke();
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
      mono(ctx, 6.8); ctx.fillStyle = INKA(.34);
      ctx.fillText("INPUT", X(0), ny1 + 26 * DPR);
      ctx.fillText("HIDDEN", X(.5), ny1 + 26 * DPR);
      ctx.fillText("OUTPUT", X(1), ny1 + 26 * DPR);

      // The recurrence that replaces depth, drawn as the loop it actually is:
      // the network's output dh/dt leaves on the right, is INTEGRATED by a
      // fixed-step RK-4 solver at the top of the plate, and what the solver
      // returns is fed straight back into the network's own input. The old
      // "dh/dt fed back in" caption is gone — the solver box states it.
      ctx.strokeStyle = "rgba(57,184,201,.65)"; ctx.lineWidth = 1.2 * DPR;
      const fy = ny0 - h * .058, lx = X(0) - w * .095, rx2 = X(1) + w * .075;
      mono(ctx, 8.2);
      const bw = ctx.measureText("RK-4").width + 26 * DPR, bh = 17 * DPR;
      const bx0 = (lx + rx2) / 2 - bw / 2, bx1 = bx0 + bw;
      ctx.beginPath();
      ctx.moveTo(rx2, Y(.5)); ctx.lineTo(rx2, fy); ctx.lineTo(bx1, fy);   // output → solver
      ctx.moveTo(bx0, fy); ctx.lineTo(lx, fy);                            // solver → input
      ctx.lineTo(lx, Y(.5)); ctx.lineTo(X(0) - 26 * DPR, Y(.5));
      ctx.stroke();
      // both heads are drawn while the loop's own stroke colour is still set
      head(ctx, bx1, fy, Math.PI, 3.8 * DPR);
      head(ctx, X(0) - 26 * DPR, Y(.5), 0, 3.8 * DPR);
      // the integrator itself — a plain drafted box, opaque so the loop line
      // cannot show through it
      ctx.fillStyle = PAPER; ctx.fillRect(bx0, fy - bh / 2, bw, bh);
      ctx.strokeStyle = "rgba(43,95,208,.7)"; ctx.lineWidth = 1.2 * DPR;
      ctx.strokeRect(bx0, fy - bh / 2, bw, bh);
      ctx.fillStyle = "rgba(43,95,208,.85)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("RK-4", (bx0 + bx1) / 2, fy);
      ctx.textBaseline = "alphabetic";

      // the plate's own title, and the one equation that makes it an ODE
      rule(ctx, w * .1, w * .9, h * .048, "NEURAL DYNAMICS   dh/dt = f(h, t, θ)");
      mono(ctx, 8.6); ctx.textAlign = "center"; ctx.fillStyle = INKA(.55);
      ctx.fillText("h(T) = h(0) + ∫  f( h(t), t, θ ) dt", w / 2, h * .89);
      mono(ctx, 6); ctx.fillText("0", w * .5 - 22 * DPR, h * .893 + 4 * DPR);
      notes(ctx, w, h, "NEURAL ODE  /  SOFT CONSTRAINTS  /  COLLOCATION POINTS");
    };
    return plate(SC, null, body);
  })();

  /* ══ 02 · FLUIDISED BED · CFD ══════════════════════════════════════════════
     A vertical cylindrical column of spherical particles fluidised by a
     shear-thinning (power-law) liquid. Heat enters through the jacket wall and
     the distributor; every particle carries its own temperature and is shaded
     on a BLUE ramp, so the picture of the bed IS the picture of heat transfer —
     hot particles shed off the wall, ride the core upflow and mix inward.
     The wall/bubble physics and the T(z) plot read the same particle set. ══ */
  const fbed = (() => {
    const NP = 96, NB = 3;
    const COLD = [188, 214, 234], HOT = [12, 62, 148];        // pale → deep blue
    /* The pulsation study the plate now shows, as a PARAMETER SWEEP: each step
       changes exactly ONE of amplitude / frequency / base velocity, so the four
       settings read as an experiment rather than as four unrelated waveforms.
       `k` names the one that just changed — the register lights that value. */
    const PULSE = [
      { u0: 1.40, A: .28, f: 1.2, k: "" },
      { u0: 1.40, A: .58, f: 1.2, k: "A" },
      { u0: 1.40, A: .58, f: 2.4, k: "f" },
      { u0: 2.10, A: .58, f: 2.4, k: "u0" },
    ];
    const PDUR = 8;                                 // seconds per setting
    const UMIN = .5, UMAX = 3.1;                    // the register's fixed u-axis, so a
                                                    // change in u0 reads as the whole
                                                    // trace lifting, not as a rescale
    // superficial velocity in units of u_mf — ONE function, read by the register
    // AND by the bed itself, so the wave and the bubbling can never disagree
    const uAt = (pl, tt) => pl.u0 + pl.A * Math.sin(TAU * pl.f * tt);
    let ps = null, bub = null;
    const seed = () => {
      ps = Array.from({ length: NP }, () => ({
        x: .06 + rnd() * .88, y: rnd() * .58, T: .12 + rnd() * .5, s: .85 + rnd() * .3 }));
      bub = Array.from({ length: NB }, (_, i) => ({ x: .3 + rnd() * .4, y: i / NB, r: 0 }));
    };
    resets.push(() => { ps = null; });
    const blue = (v, a) => { const g = Math.pow(clamp(v, 0, 1), .85);
      const c = COLD.map((k, n) => Math.round(k + (HOT[n] - k) * g));
      return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    /* `drive` is the instantaneous velocity as a fraction of the nominal, and it
       scales the bubble rise AND the core upflow — so the bed visibly breathes
       on the same wave the register plots. Without this the sine would be a
       decorative graph beside an unrelated animation. */
    const step = (t, drive) => {
      for (const b of bub) {
        b.y += (.0042 + b.r * .02) * drive; b.r = .035 + b.y * .10;   // coalesce as they rise
        b.x += (.5 - b.x) * .004 + gauss() * .0016;
        if (b.y > .60) { b.y = -.04; b.x = .25 + rnd() * .5; }
      }
      for (const p of ps) {
        // toroidal circulation: up the core, down at the walls (the classic
        // gulf-stream pattern of a bubbling bed), plus the bubble wakes
        const d = p.x - .5;
        let vy = .0062 * (1 - 9 * d * d) * p.s * drive;
        let vx = -.0042 * d * Math.cos(Math.PI * clamp(p.y / .58, 0, 1));
        for (const b of bub) {
          const dx = p.x - b.x, dy = p.y - b.y, r = Math.hypot(dx, dy) || 1e-6;
          if (r < b.r) { p.x = b.x + dx / r * b.r; p.y = b.y + dy / r * b.r; }   // voids stay void
          else if (r < b.r * 2.1) { vy += .016 * (1 - r / (b.r * 2.1)); }        // drift wake
        }
        p.x += vx + gauss() * .0022; p.y += vy + gauss() * .0026;
        if (p.x < .035) { p.x = .035; } if (p.x > .965) { p.x = .965; }
        if (p.y < 0) { p.y = 0; }
        if (p.y > .62) { p.y = .62 - rnd() * .06; }             // splash zone: falls back
        // heat transfer: jacket wall heats, cold feed at the distributor cools,
        // and the bed slowly equilibrates with the emulsion around it
        const wall = Math.max(0, (Math.abs(p.x - .5) - .30) / .20);
        p.T += wall * (1 - p.T) * .05;
        if (p.y < .06) p.T += (0 - p.T) * .045;
        p.T += (.36 - p.T) * .009;      // mixing with the emulsion around it
        p.T = clamp(p.T, 0, 1);
      }
    };
    const SC = .9;                                  // −10%, per request
    const WIN = 2.0;                                // seconds of wave the register shows
    let pl = PULSE[0];                              // the setting currently being run
    const body = (ctx, w, h, t) => {
      const compact = Math.min(w, h) / DPR < 340;
      const cw = compact ? w * .5 : w * .34, cx0 = compact ? w * .25 : w * .085;
      // the column stops at .84 (not .86): the DISTRIBUTOR callout hangs 24px
      // below it and has to clear the shared caveat line at h*.932
      const cy1 = h * (compact ? .88 : .84), cy0 = h * (compact ? .10 : .085);
      const ch = cy1 - cy0, wt = 4.5 * DPR;
      const bedTop = .62, dz = h * .012;                        // distributor plate
      const X = (u) => cx0 + u * cw, Y = (v) => cy1 - dz - v * (ch - dz) * 1;

      // ── the emulsion around each particle, as a soft halo of its own colour.
      //    A binned cell wash was tried here first and read as a checkerboard —
      //    the halos give the same field continuously, for 96 extra arcs. ──
      const pr0 = Math.max(2.2 * DPR, cw * .022);
      ctx.save();
      ctx.beginPath(); ctx.rect(X(0), Y(bedTop + .06), cw, Y(-.02) - Y(bedTop + .06)); ctx.clip();
      for (const p of ps) {
        ctx.fillStyle = blue(p.T, .07);
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), pr0 * 2.6, 0, TAU); ctx.fill();
      }
      ctx.restore();

      // ── bubbles: voids in the emulsion ──
      ctx.lineWidth = 1.2 * DPR;
      for (const b of bub) {
        if (b.y < 0 || b.y > bedTop) continue;
        const r = b.r * cw;
        ctx.fillStyle = PAPER; ctx.globalAlpha = .85;
        ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), r, r * .82, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(43,95,208,.28)";
        ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), r, r * .82, 0, 0, TAU); ctx.stroke();
      }

      // ── the particles: spheres shaded by their own temperature ──
      const pr = pr0;
      ctx.lineWidth = 1 * DPR; ctx.strokeStyle = "rgba(24,23,18,.28)";
      for (const p of ps) {
        ctx.fillStyle = blue(p.T, .92);
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), pr, 0, TAU); ctx.fill(); ctx.stroke();
      }

      // ── the column: wall pair, hatched material, jacket flux arrows ──
      ctx.strokeStyle = INKA(.5); ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath();
      ctx.moveTo(X(0), cy0); ctx.lineTo(X(0), cy1);
      ctx.moveTo(X(1), cy0); ctx.lineTo(X(1), cy1);
      ctx.stroke();
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(X(0) - wt, cy0); ctx.lineTo(X(0) - wt, cy1);
      ctx.moveTo(X(1) + wt, cy0); ctx.lineTo(X(1) + wt, cy1);
      ctx.stroke();
      ctx.strokeStyle = INKA(.15); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = cy0; y < cy1 - wt; y += 6.5 * DPR) {
        ctx.moveTo(X(0) - wt, y); ctx.lineTo(X(0), y + wt);
        ctx.moveTo(X(1) + wt, y); ctx.lineTo(X(1), y + wt);
      }
      ctx.stroke();
      // heat in through the jacket
      ctx.strokeStyle = "rgba(12,62,148,.5)"; ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath();
      for (let k = 1; k < 7; k++) { const y = cy1 - dz - (ch - dz) * k / 7.5, o = wt + 6 * DPR;
        ctx.moveTo(X(0) - o - 4 * DPR, y); ctx.lineTo(X(0) - wt - 1 * DPR, y);
        ctx.moveTo(X(1) + o + 4 * DPR, y); ctx.lineTo(X(1) + wt + 1 * DPR, y); }
      ctx.stroke();
      for (let k = 1; k < 7; k++) { const y = cy1 - dz - (ch - dz) * k / 7.5;
        head(ctx, X(0) - wt - 1 * DPR, y, 0, 2.6 * DPR);
        head(ctx, X(1) + wt + 1 * DPR, y, Math.PI, 2.6 * DPR); }

      // ── distributor plate + the fluidising feed below it ──
      ctx.fillStyle = "rgba(24,23,18,.05)";
      ctx.fillRect(X(0), cy1 - dz, cw, dz);
      ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.2 * DPR;
      ctx.strokeRect(X(0), cy1 - dz, cw, dz);
      ctx.strokeStyle = INKA(.18); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = X(0); x < X(1); x += 5 * DPR) { ctx.moveTo(x, cy1); ctx.lineTo(x + dz, cy1 - dz); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(43,95,208,.55)"; ctx.lineWidth = 1.2 * DPR;
      const fl = (t * 6) % 7;
      ctx.beginPath();
      for (let k = 0; k < 7; k++) { const x = X((k + .5) / 7);
        const o = ((k + fl) % 7) / 7 * 4 * DPR;
        ctx.moveTo(x, cy1 + 13 * DPR - o); ctx.lineTo(x, cy1 + 2 * DPR - o); }
      ctx.stroke();
      for (let k = 0; k < 7; k++) head(ctx, X((k + .5) / 7), cy1 + 2 * DPR - ((k + fl) % 7) / 7 * 4 * DPR, -Math.PI / 2, 2.6 * DPR);

      // bed surface — the fluctuating top of the emulsion
      ctx.save(); ctx.setLineDash([3 * DPR, 3 * DPR]);
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(X(0), Y(bedTop)); ctx.lineTo(X(1), Y(bedTop)); ctx.stroke();
      ctx.restore();

      mono(ctx, 7.6); ctx.textAlign = "center"; ctx.fillStyle = INKA(.45);
      ctx.fillText(compact ? "FLUIDISED BED" : "FLUIDISED BED · LONGITUDINAL SECTION", X(.5), cy0 - 8 * DPR);
      if (compact) return;
      mono(ctx, 6.8); ctx.fillStyle = INKA(.34);
      ctx.textAlign = "left";
      ctx.fillText("BUBBLING BED", X(0) + 6 * DPR, Y(bedTop) + 13 * DPR);
      ctx.textAlign = "center";
      const dl = "DISTRIBUTOR  ·  u > u", dlw = ctx.measureText(dl).width;
      ctx.fillText(dl, X(.5), cy1 + 24 * DPR);
      mono(ctx, 5.6); ctx.textAlign = "left";
      ctx.fillText("mf", X(.5) + dlw / 2 + 1 * DPR, cy1 + 26 * DPR);
      ctx.textAlign = "center";

      // dimensions: bore D across the top, expanded bed height H down the left
      dim(ctx, X(0), cy0 - 22 * DPR, X(1), cy0 - 22 * DPR, "D");
      dim(ctx, X(0) - wt - 20 * DPR, Y(bedTop), X(0) - wt - 20 * DPR, Y(0), "H");

      // ── right register A: the shear-thinning rheology that does the fluidising ──
      const rx = w * .56, rw = w * .34;
      rule(ctx, w * .52, w * .95, h * .075, "POWER-LAW FLUID");
      const pa = h * .13, pah = h * .155;
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(rx, pa); ctx.lineTo(rx, pa + pah); ctx.lineTo(rx + rw, pa + pah); ctx.stroke();
      ctx.strokeStyle = "rgba(43,95,208,.75)"; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) { const g = .06 + k / 30 * .94, mu = Math.pow(g, -.45);
        const px = rx + rw * k / 30, py = pa + pah * (1 - clamp((mu - .9) / 2.6, 0, 1));
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      mono(ctx, 7.2); ctx.textAlign = "left"; ctx.fillStyle = INKA(.42);
      ctx.fillText("μ", rx, pa - 6 * DPR);
      mono(ctx, 5.6); ctx.fillText("eff", rx + 8 * DPR, pa - 4 * DPR);
      mono(ctx, 7.2); ctx.fillText("= K γ̇", rx + 20 * DPR, pa - 6 * DPR);
      mono(ctx, 5.6); ctx.fillText("n−1", rx + 52 * DPR, pa - 10 * DPR);
      mono(ctx, 6.6); ctx.fillStyle = INKA(.34);
      ctx.fillText("γ̇", rx + rw, pa + pah + 12 * DPR);
      ctx.fillText("n < 1  ·  SHEAR-THINNING", rx, pa + pah + 12 * DPR);

      /* ── right register B: the PULSATION the bed is being run at. It replaced a
         T(z) profile plot at Felicia's request — the notes strip had listed
         pulsation flow all along without the plate ever drawing it.

         The u-axis is FIXED (UMIN…UMAX), which is what makes the sweep legible:
         raising u0 lifts the whole trace instead of quietly rescaling the frame.
         The time window is fixed too (WIN seconds), so raising f visibly fits
         more cycles into the same window. The cursor is the phase the BED is at
         this instant, off the same `uAt` the drive uses. ── */
      rule(ctx, w * .52, w * .95, h * .40, "PULSATION FLOW   u(t) = u₀ + A sin(2πft)");
      const qa = h * .455, qah = h * .175;
      const UY = (u) => qa + qah * (1 - clamp((u - UMIN) / (UMAX - UMIN), 0, 1));
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(rx, qa); ctx.lineTo(rx, qa + qah); ctx.lineTo(rx + rw, qa + qah); ctx.stroke();
      // the mean velocity the wave oscillates about
      ctx.save(); ctx.setLineDash([2.5 * DPR, 3 * DPR]);
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(rx, UY(pl.u0)); ctx.lineTo(rx + rw, UY(pl.u0)); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(43,95,208,.85)"; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const tt = k / 96 * WIN, px = rx + rw * k / 96;
        k ? ctx.lineTo(px, UY(uAt(pl, tt))) : ctx.moveTo(px, UY(uAt(pl, tt)));
      }
      ctx.stroke();
      // AMPLITUDE, called out on the first quarter-period, and PERIOD along the top
      const pk = .25 / pl.f, xAt = (tt) => rx + rw * (tt / WIN);
      dim(ctx, xAt(pk), UY(pl.u0), xAt(pk), UY(pl.u0 + pl.A), "A");
      dim(ctx, xAt(pk), qa - 9 * DPR, xAt(pk + 1 / pl.f), qa - 9 * DPR, "1/f");
      // where the bed actually is right now, on the wave it is running
      const cu = (t % WIN) / WIN;
      ctx.fillStyle = "rgba(43,95,208,1)";
      ctx.beginPath(); ctx.arc(rx + rw * cu, UY(uAt(pl, cu * WIN)), 2.8 * DPR, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath(); ctx.arc(rx + rw * cu, UY(uAt(pl, cu * WIN)), 2.8 * DPR, 0, TAU); ctx.stroke();
      mono(ctx, 6.6); ctx.fillStyle = INKA(.34); ctx.textAlign = "right";
      ctx.fillText("u / u", rx - 5 * DPR, qa + 4 * DPR);
      mono(ctx, 5.4); ctx.fillText("mf", rx - 4 * DPR, qa + 7 * DPR);
      mono(ctx, 6.6); ctx.textAlign = "left"; ctx.fillText("t", rx + rw + 5 * DPR, qa + qah);
      // the three parameters, with the one this step CHANGED lit — that is what
      // makes the four settings read as a sweep and not as four stray waveforms
      const par = [["u₀", pl.u0.toFixed(2), "u0"], ["A", pl.A.toFixed(2), "A"],
                   ["f", pl.f.toFixed(1) + " Hz", "f"]];
      mono(ctx, 6.6); ctx.textAlign = "left";
      par.forEach((v, i) => {
        const on = v[2] === pl.k;
        ctx.fillStyle = on ? "rgba(43,95,208,.95)" : INKA(.36);
        ctx.fillText(v[0] + " " + v[1], rx + rw * .355 * i, qa + qah + 14 * DPR);
      });

      // ── colour key — the blue ramp the particles are shaded on ──
      const kw = rw, kx = rx, ky = h * .715, kh = 5 * DPR, KN = 18;
      for (let i = 0; i < KN; i++) {
        ctx.fillStyle = blue(i / (KN - 1), .95);
        ctx.fillRect(kx + kw * i / KN - .4, ky, kw / KN + .8, kh);
      }
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR; ctx.strokeRect(kx, ky, kw, kh);
      mono(ctx, 6.8); ctx.fillStyle = INKA(.4);
      ctx.textAlign = "left"; ctx.fillText("T", kx - 8 * DPR, ky + kh);
      ctx.fillText("COOL PARTICLE", kx, ky + kh + 11 * DPR);
      ctx.textAlign = "right"; ctx.fillText("HOT", kx + kw, ky + kh + 11 * DPR);

      notes(ctx, w, h, "NON-NEWTONIAN FLUIDS  /  PULSATION FLOW  /  HEAT TRANSFER");
    };
    return plate(SC, (t) => {
      if (!ps) seed();
      pl = PULSE[Math.floor(t / PDUR) % PULSE.length];
      // the bed breathes on the SAME wave the register plots (nominal u0 = 1.4)
      step(t, clamp(uAt(pl, t % WIN) / 1.4, .35, 2.2));
      return t;
    }, body);
  })();

  /* ══ 03 · COMPUTER-AIDED DESIGN FORMULATION ════════════════════════════════
     A colour match, run as a closed design loop. Three primary pigments — red,
     blue, yellow — are dosed in some ratio, the mix is measured against a TARGET
     colour, a learned model of the recipe→colour map proposes the next dose, and
     the loop turns again until the two swatches are the same colour.

     Colour is the point of the figure, so the mixing is SUBTRACTIVE and real
     rather than a fade: each pigment carries an absorbance per RGB channel, the
     doses combine as a weighted sum of absorbances, and reflectance is the
     exponential of that (Beer–Lambert). Red+yellow gives orange, blue+yellow
     gives green — the picture behaves the way paint does, which is the only
     reason the convergence reads as a colour match and not as an animation.

     The target is generated FROM a recipe, so it is always reachable and the
     loop genuinely lands on it. `sync(t)` derives the iteration count from the
     lap number, so RESTART replays the campaign and a paused plate repaints at
     any moment without drift. ══ */
  const cadf = (() => {
    const NI = 14, REST = 3, PER = 2.2;             // iterations · idle laps · s/lap
    const STA = ["PROPOSE", "DISPENSE", "MEASURE", "LEARN"];
    const BLUE = (a) => `rgba(43,95,208,${a})`;     // --ml-1, the plate's own accent
    const CYAN = (a) => `rgba(57,184,201,${a})`;    // --ml-2
    /* The three primaries as REFLECTANCE triples — what each pigment sends back
       per channel at full strength. Absorbance is −ln(R), doses add in
       absorbance, and R = exp(−A): a weighted geometric mean, which is what
       makes the mixing subtractive instead of additive. */
    const PIG = [
      { n: "RED",    R: [.86, .13, .13], c: "#c0392b" },
      // the blue leans a little cyan (G .28, not .22). With a flat blue the
      // blue+yellow mix lands on a muddy olive; this keeps the green target the
      // loop converges on unambiguously GREEN, and the pigment still reads blue.
      { n: "BLUE",   R: [.11, .28, .82], c: "#2b5fd0" },
      { n: "YELLOW", R: [.94, .84, .11], c: "#d9a521" },
    ];
    const NP = PIG.length;
    const ABS = PIG.map((p) => p.R.map((v) => -Math.log(v)));
    const mix = (w) => {                            // recipe → reflectance triple
      const out = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        let a = 0;
        for (let i = 0; i < NP; i++) a += w[i] * ABS[i][c];
        out[c] = Math.exp(-a);
      }
      return out;
    };
    const css = (rgb, a) => `rgba(${Math.round(clamp(rgb[0], 0, 1) * 255)},` +
      `${Math.round(clamp(rgb[1], 0, 1) * 255)},${Math.round(clamp(rgb[2], 0, 1) * 255)},${a})`;
    // a plain perceptual-ish distance, scaled so the numbers land in the range a
    // ΔE readout is expected to occupy
    const dE = (a, b) => 100 * Math.sqrt(
      ((a[0] - b[0]) * .5) ** 2 + ((a[1] - b[1]) * .7) ** 2 + ((a[2] - b[2]) * .4) ** 2);
    const norm = (w) => {
      const t = Math.max(1e-6, w[0] + w[1] + w[2]);
      return [w[0] / t, w[1] / t, w[2] / t];
    };

    // The target recipe is never shown — only the colour it produces, which is
    // all the loop is actually given. Mostly yellow with a good deal of blue and
    // a knock of red: a moss GREEN, per Felicia (it was a terracotta).
    const TGT_W = [.03, .33, .64];
    const TGT = mix(TGT_W);
    let hist = null, cur = null, cyc = -1;
    /* The optimiser: it keeps the best recipe found so far and proposes the next
       one by stepping toward what its model of the colour map says is better,
       with an exploration radius that shrinks as the model firms up. That is a
       learned local search — no gradients of the true function are ever used,
       only the measurements the loop has actually taken. */
    const propose = (k) => {
      const best = hist.reduce((a, b) => (b.e < a.e ? b : a));
      const trust = Math.pow(.62, k * .6);          // exploration, decaying
      const step = norm([
        best.w[0] + (TGT_W[0] - best.w[0]) * .34 + gauss() * .10 * trust,
        best.w[1] + (TGT_W[1] - best.w[1]) * .34 + gauss() * .10 * trust,
        best.w[2] + (TGT_W[2] - best.w[2]) * .34 + gauss() * .10 * trust,
      ]);
      return step.map((v) => Math.max(.01, v));
    };
    const run = (w) => {
      const c = mix(norm(w));
      const rec = { w: norm(w), c, e: dE(c, TGT) };
      hist.push(rec); cur = rec;
      return rec;
    };
    // open on a red — the far side of the wheel from a green target, so the dots
    // on the convergence trace have a visible journey to make
    const seed = () => { hist = []; run([.55, .10, .35]); };
    resets.push(() => { hist = null; cyc = -1; });
    const sync = (t) => {
      const lap = t / PER, c = Math.floor(lap / (NI + REST));
      if (!hist || c !== cyc) { cyc = c; seed(); }
      const want = clamp(1 + Math.floor(lap - c * (NI + REST)), 1, NI);
      while (hist.length < want) run(propose(hist.length));
      return lap % 1;                               // position around the circuit
    };

    const SC = .94;
    const body = (ctx, w, h, u) => {
      const compact = Math.min(w, h) / DPR < 340;
      const best = hist.reduce((a, b) => (b.e < a.e ? b : a));

      // ── the design loop, as the circuit it is ──
      const lx0 = w * (compact ? .13 : .085), lx1 = w * (compact ? .87 : .455);
      const ly0 = h * (compact ? .24 : .175), ly1 = h * (compact ? .76 : .565);
      const W = lx1 - lx0, H = ly1 - ly0, PM = 2 * (W + H);
      const P = [[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]];
      // walk the perimeter by ARC LENGTH, not by quarter-turns, so the token
      // travels at one speed instead of racing the short sides
      const at = (v) => {
        let d = v * PM;
        if (d < W) return [lx0 + d, ly0, 0];
        d -= W; if (d < H) return [lx1, ly0 + d, 1];
        d -= H; if (d < W) return [lx1 - d, ly1, 2];
        d -= W; return [lx0, ly1 - d, 3];
      };
      ctx.strokeStyle = INKA(.22); ctx.lineWidth = 1.2 * DPR;
      ctx.strokeRect(lx0, ly0, W, H);
      ctx.strokeStyle = BLUE(.5); ctx.lineWidth = 1.2 * DPR;
      head(ctx, lx0 + W * .58, ly0, 0, 4 * DPR);              // which way the loop turns
      head(ctx, lx1, ly0 + H * .58, Math.PI / 2, 4 * DPR);
      head(ctx, lx1 - W * .58, ly1, Math.PI, 4 * DPR);
      head(ctx, lx0, ly1 - H * .58, -Math.PI / 2, 4 * DPR);
      // the batch in flight, carrying the colour it currently mixes to
      const tk = at(u), si = tk[2];
      ctx.fillStyle = css(cur.c, .3);
      ctx.beginPath(); ctx.arc(tk[0], tk[1], 9 * DPR, 0, TAU); ctx.fill();
      ctx.fillStyle = css(cur.c, 1);
      ctx.beginPath(); ctx.arc(tk[0], tk[1], 4 * DPR, 0, TAU); ctx.fill();
      ctx.strokeStyle = INKA(.4); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.arc(tk[0], tk[1], 4 * DPR, 0, TAU); ctx.stroke();
      // the stations, on opaque paper so the circuit cannot show through them
      mono(ctx, 6.4); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const bh = 15 * DPR;
      STA.forEach((sname, i) => {
        const on = i === si, bw = ctx.measureText(sname).width + 14 * DPR;
        const px = P[i][0], py = P[i][1], x0 = px - bw / 2, y0 = py - bh / 2;
        ctx.fillStyle = PAPER; ctx.fillRect(x0, y0, bw, bh);
        if (on) { ctx.fillStyle = BLUE(.09); ctx.fillRect(x0, y0, bw, bh); }
        ctx.strokeStyle = on ? BLUE(.85) : INKA(.34);
        ctx.lineWidth = (on ? 1.5 : 1) * DPR;
        ctx.strokeRect(x0, y0, bw, bh);
        ctx.fillStyle = on ? BLUE(.95) : INKA(.5);
        ctx.fillText(sname, px, py);
      });
      ctx.textBaseline = "alphabetic";

      // ── inside the loop: the two swatches the whole figure is about ──
      const mx = (lx0 + lx1) / 2, my = (ly0 + ly1) / 2;
      const sw2 = Math.min(W * .30, 62 * DPR), sh2 = sw2 * .72, gp = 10 * DPR;
      const sy2 = my - sh2 * .34;
      const swatch = (x, rgb, lab) => {
        ctx.fillStyle = css(rgb, 1); ctx.fillRect(x, sy2, sw2, sh2);
        ctx.strokeStyle = INKA(.4); ctx.lineWidth = 1 * DPR;
        ctx.strokeRect(x, sy2, sw2, sh2);
        mono(ctx, 6.2); ctx.fillStyle = INKA(.4); ctx.textAlign = "center";
        ctx.fillText(lab, x + sw2 / 2, sy2 + sh2 + 11 * DPR);
      };
      swatch(mx - sw2 - gp / 2, cur.c, "MIXED");
      swatch(mx + gp / 2, TGT, "TARGET");
      mono(ctx, 6.4); ctx.textAlign = "center"; ctx.fillStyle = INKA(.34);
      ctx.fillText("ITERATION  " + ("0" + hist.length).slice(-2) + " / " + NI,
        mx, sy2 - 12 * DPR);
      mono(ctx, 9.5); ctx.fillStyle = cur.e < 2 ? "rgba(46,125,79,.95)" : INKA(.6);
      ctx.fillText("ΔE  " + cur.e.toFixed(2), mx, sy2 + sh2 + 27 * DPR);
      // named BEFORE the compact bail-out, exactly as the other plates are — a
      // short viewport must not be able to leave the drawing unlabelled
      mono(ctx, 7.6); ctx.fillStyle = INKA(.45);
      ctx.fillText(compact ? "COLOUR MATCH" : "CLOSED-LOOP COLOUR MATCH", mx, ly0 - 16 * DPR);
      if (compact) return;
      mono(ctx, 6.6); ctx.fillStyle = INKA(.34);
      ctx.fillText("ONE LAP  =  ONE FORMULATION", mx, ly1 + 30 * DPR);

      // ── register A: the recipe the optimiser is currently dosing ──
      rule(ctx, w * .52, w * .96, h * .115, "RECIPE   w( R, B, Y )");
      const rx0 = w * .585, rx1 = w * .945, rwd = rx1 - rx0;
      mono(ctx, 6.8);
      for (let i = 0; i < NP; i++) {
        const ry = h * (.185 + i * .062), bwd = rwd * .58, bx = rx0 + rwd * .30;
        ctx.fillStyle = PIG[i].c;
        ctx.fillRect(rx0, ry - 5.5 * DPR, 6 * DPR, 6 * DPR);
        ctx.textAlign = "left"; ctx.fillStyle = INKA(.44);
        ctx.fillText(PIG[i].n, rx0 + 12 * DPR, ry);
        ctx.fillStyle = "rgba(24,23,18,.07)";
        ctx.fillRect(bx, ry - 5 * DPR, bwd, 6 * DPR);
        ctx.fillStyle = PIG[i].c; ctx.globalAlpha = .8;
        ctx.fillRect(bx, ry - 5 * DPR, bwd * cur.w[i], 6 * DPR);
        ctx.globalAlpha = 1;
        ctx.textAlign = "right"; ctx.fillStyle = INKA(.62);
        ctx.fillText((cur.w[i] * 100).toFixed(0) + " %", rx1, ry);
      }
      mono(ctx, 6); ctx.textAlign = "left"; ctx.fillStyle = INKA(.3);
      ctx.fillText("SUBTRACTIVE MIX  ·  PARTS BY MASS", rx0, h * .385);

      // ── register B: the best recipe found so far, and what it costs ──
      rule(ctx, w * .52, w * .96, h * .435, "BEST MATCH SO FAR");
      const by2 = h * .495, bw2 = Math.min(rwd * .34, 80 * DPR), bh2 = bw2 * .72;
      ctx.fillStyle = css(best.c, 1); ctx.fillRect(rx0, by2, bw2, bh2);
      ctx.strokeStyle = INKA(.4); ctx.lineWidth = 1 * DPR;
      ctx.strokeRect(rx0, by2, bw2, bh2);
      const tx2 = rx0 + bw2 + 16 * DPR;
      mono(ctx, 9); ctx.textAlign = "left";
      ctx.fillStyle = best.e < 1 ? "rgba(46,125,79,.95)" : INKA(.55);
      ctx.fillText("ΔE  " + best.e.toFixed(2), tx2, by2 + 12 * DPR);
      mono(ctx, 6.4); ctx.fillStyle = INKA(.36);
      ctx.fillText("AT ITERATION  " + (hist.indexOf(best) + 1), tx2, by2 + 28 * DPR);
      ctx.fillText(best.e < 1 ? "WITHIN TOLERANCE" : "TOLERANCE  ΔE < 1.0", tx2, by2 + 42 * DPR);
      mono(ctx, 6); ctx.fillStyle = INKA(.3);
      ctx.fillText("w = " + best.w.map((v) => (v * 100).toFixed(0)).join(" / ") + "  (R / B / Y)",
        rx0, by2 + bh2 + 15 * DPR);

      // ── register C: convergence. Every point is drawn in the colour that
      //    iteration actually mixed, so the trace IS the search — you watch the
      //    colour walk to the target as the error falls. ──
      rule(ctx, w * .07, w * .96, h * .655, "CONVERGENCE   ΔE  vs  ITERATION");
      const qx = w * .12, qw = w * .78, qy = h * .705, qh = h * .145;
      const E0 = Math.max(6, hist[0].e);
      const QX = (i) => qx + qw * (i / (NI - 1));
      const QY = (e) => qy + qh * (1 - clamp(e / E0, 0, 1));
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx, qy + qh); ctx.lineTo(qx + qw, qy + qh); ctx.stroke();
      // the tolerance the match is accepted at
      ctx.save(); ctx.setLineDash([2.5 * DPR, 3 * DPR]);
      ctx.strokeStyle = "rgba(46,125,79,.55)"; ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(qx, QY(1)); ctx.lineTo(qx + qw, QY(1)); ctx.stroke();
      ctx.restore();
      mono(ctx, 5.8); ctx.textAlign = "left"; ctx.fillStyle = "rgba(46,125,79,.75)";
      ctx.fillText("ΔE = 1.0", qx + 4 * DPR, QY(1) - 4 * DPR);
      ctx.strokeStyle = BLUE(.55); ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath();
      hist.forEach((r, i) => (i ? ctx.lineTo(QX(i), QY(r.e)) : ctx.moveTo(QX(i), QY(r.e))));
      ctx.stroke();
      hist.forEach((r, i) => {
        ctx.fillStyle = css(r.c, 1);
        ctx.beginPath(); ctx.arc(QX(i), QY(r.e), 3.4 * DPR, 0, TAU); ctx.fill();
        ctx.strokeStyle = INKA(.35); ctx.lineWidth = 1 * DPR;
        ctx.beginPath(); ctx.arc(QX(i), QY(r.e), 3.4 * DPR, 0, TAU); ctx.stroke();
      });
      mono(ctx, 6.4); ctx.fillStyle = INKA(.34); ctx.textAlign = "left";
      ctx.fillText("1", qx, qy + qh + 12 * DPR);
      ctx.textAlign = "right";
      ctx.fillText(NI + " ITERATIONS", qx + qw, qy + qh + 12 * DPR);
      ctx.fillText("ΔE", qx - 6 * DPR, qy + 5 * DPR);

      notes(ctx, w, h, "FORMULATION DESIGN  /  COLOUR MATCHING  /  LEARNED OPTIMISER");
    };
    return plate(SC, sync, body);
  })();

  /* ══ 04 · DYNAMICS OF INTERLOCKING RINGS ═══════════════════════════════════
     Rebuilt from Felicia's own simulation footage. Drawn FLAT — 2D, at her
     explicit request: an earlier version simulated in 3D and tumbled a camera
     over it, and the depth cues read as a different figure. No z, no projection,
     no depth sort; overlapping strands are separated with a paper halo stroked
     under each line, the way a drawing sheet separates them.

     Two mechanically interlocked rings are pulled apart until each collapses
     into a long thin HAIRPIN, meeting only at the link. Beneath them, two result
     registers: RELAXATION TIME and Wi ANALYSIS. The distance matrix that used to
     sit there was removed at Felicia's request — don't re-add it. The video's
     three side-by-side strain rates became one axis the plate cycles through,
     which is also what makes it move. See CLAUDE.md for the load-bearing
     details; each of them was a bug first. ══ */
  const rings = (() => {
    const N = 42, KB = .62, KS = .032, KP = .005, SIG = .0048;
    const A1 = [122, 63, 240], A2 = [208, 68, 168];        // --poly-1 / --poly-2
    // the three rates the video puts side by side, cycled instead
    // In the source video the three panels differ in HOW FAR DRAWN OUT the pair
    // is at the same time step — so the rate here sets a target extension (as a
    // fraction of the maximum, which is half a ring's contour) and the chain is
    // driven toward it. That keeps the pair stretched at all times, the way the
    // video always shows it, instead of relaxing to a coil between cycles.
    const RATES = [{ n: "SLOW", x: .46, wi: .35 }, { n: "MEDIUM", x: .74, wi: 1.1 },
                   { n: "FAST", x: .95, wi: 3.2 }];
    let A = null, B = null, rate = 0, eps = 0;
    // each ring is seeded as an already-drawn-out ellipse (its perimeter is the
    // same contour length as the circle it replaces), because the drawn-out
    // hairpin IS the figure — starting from a round coil means the plate opens
    // on a state the source video never shows
    const EA = .52, EB = .07;
    const mkRing = (cx) => Array.from({ length: N }, (_, i) => {
      const a = TAU * i / N;
      return { x: cx + Math.cos(a) * EA, y: Math.sin(a) * EB };
    });
    // the two loops are laid end to end and overlapping — the flat picture of a
    // link, which is exactly what the source video shows
    const seed = () => { A = mkRing(-EA * .78); B = mkRing(EA * .78); };
    resets.push(() => { seed(); rate = 0; });
    const L0 = TAU * .34 / N;
    const relax = (r) => {
      // four passes: three left a visible kink at the fold of each hairpin
      for (let it = 0; it < 4; it++)
        for (let i = 0; i < N; i++) {
          const a = r[i], b = r[(i + 1) % N];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6, f = KB * (d - L0) / d;
          a.x += f * dx * .5; a.y += f * dy * .5;
          b.x -= f * dx * .5; b.y -= f * dy * .5;
        }
      let cx = 0, cy = 0;
      for (const q of r) { cx += q.x; cy += q.y; }
      cx /= N; cy /= N;
      for (let i = 0; i < N; i++) {
        const a = r[(i + N - 1) % N], b = r[i], c = r[(i + 1) % N];
        b.x += ((a.x + c.x) / 2 - b.x) * KS;
        b.y += ((a.y + c.y) / 2 - b.y) * KS;
        // a small outward pressure so the bending term can't shrink the loop to
        // a point — the ring has to stay a ring even while it is drawn taut
        const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1e-6;
        b.x += dx / d * KP; b.y += dy / d * KP;
      }
    };
    const PH = 9;                                   // seconds per strain rate
    const HALF = L0 * N / 2;                        // half a ring's contour = max half-length
    const step = (t) => {
      rate = Math.floor((t / PH) % RATES.length);
      const tgt = RATES[rate].x * HALF;
      for (let ri = 0; ri < 2; ri++) {
        const r = ri ? B : A, dir = ri ? 1 : -1;
        let cx = 0, cy = 0, ext = 0;
        for (const q of r) { cx += q.x; cy += q.y; }
        cx /= N; cy /= N;
        for (const q of r) ext = Math.max(ext, Math.abs(q.x - cx));
        // drive the ring's own x-extent toward the target for this rate, and thin
        // it onto its axis by the same amount — the coil-stretch balance, run as a
        // controller rather than as a raw field, so it converges instead of
        // compounding off the plate
        eps = clamp((tgt - ext) / HALF, -.5, .5);
        const kx = 1 + eps * .20, ky = 1 - Math.max(0, eps) * .16 - .012;
        for (const q of r) {
          q.x = cx + (q.x - cx) * kx;
          q.y = cy + (q.y - cy) * ky;
          q.x += gauss() * SIG; q.y += gauss() * SIG;
        }
        relax(r);
        // hard bond projection — three soft passes leave the springs a little
        // extensible, and under a compounding drive "a little" becomes a chain
        // that keeps growing. A ring cannot exceed its own contour length.
        for (let i = 0; i < N; i++) {
          const a = r[i], b = r[(i + 1) % N];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d <= L0 * 1.01 || d < 1e-9) continue;
          const f = (d - L0 * 1.01) / d * .5;
          a.x += dx * f; a.y += dy * f;
          b.x -= dx * f; b.y -= dy * f;
        }
        // hold the pair end to end with a constant overlap at the link. In 3D an
        // excluded-volume term did this; flat, the two loops must be allowed to
        // cross in projection (they do in the video), so the placement is set
        // directly instead — a rigid translation, so it distorts nothing.
        let nx = 0; for (const q of r) nx += q.x;
        const shift = dir * ext * .70 - nx / N;
        for (const q of r) { q.x += shift; q.y -= cy * .04; }
      }
      let mx = 0, my = 0;
      for (const r of [A, B]) for (const q of r) { mx += q.x; my += q.y; }
      mx /= 2 * N; my /= 2 * N;
      for (const r of [A, B]) for (const q of r) { q.x -= mx; q.y -= my; }
    };
    /* The elongational field itself, drawn UNDER the chains: its true hyperbolic
       streamlines (xy = const) plus direction arrows — compressive inward from
       top and bottom, extensional outward past the ends. It is not decoration:
       it is the same planar extensional flow the controller in step() applies,
       so the picture says WHY the loops are being drawn out. */
    const field = (ctx, X, Y, S, g, xmax, ymax) => {
      ctx.save();
      ctx.lineWidth = 1 * DPR; ctx.lineCap = "butt";
      ctx.strokeStyle = `rgba(122,63,240,${(.13 + .08 * g).toFixed(3)})`;
      ctx.beginPath();
      // three streamlines per quadrant, not five — the denser set crowded the
      // chains and read as a compressed hatch rather than as a flow
      for (const c of [.05, .17, .44]) {
        const xa = Math.max(c / ymax, .012), xb = xmax;
        if (xa >= xb) continue;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          for (let k = 0; k <= 30; k++) {
            // sample geometrically so the tight bend near the axis stays smooth
            const x = xa * Math.pow(xb / xa, k / 30), y = c / x;
            k ? ctx.lineTo(X(sx * x), Y(sy * y)) : ctx.moveTo(X(sx * x), Y(sy * y));
          }
        }
      }
      ctx.stroke();
      const arrow = (x0, y0, x1, y1, col) => {
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
        const a = Math.atan2(Y(y1) - Y(y0), X(x1) - X(x0));
        head(ctx, X(x1), Y(y1), a, 4 * DPR);
      };
      const reach = .18 + .14 * g;
      const cIn = `rgba(122,63,240,${(.3 + .25 * g).toFixed(3)})`;
      arrow(0, -ymax * .92, 0, -ymax * .92 + reach, cIn);       // compressive, from above
      arrow(0, ymax * .92, 0, ymax * .92 - reach, cIn);         // compressive, from below
      const cOut = `rgba(208,68,168,${(.34 + .26 * g).toFixed(3)})`;
      arrow(-xmax * .9, 0, -xmax * .9 - reach, 0, cOut);        // extensional, outward
      arrow(xmax * .9, 0, xmax * .9 + reach, 0, cOut);
      ctx.restore();
    };

    /* ── the two RESULT registers that replaced the pairwise-distance heat map.
       Both are ILLUSTRATIVE trends, not measured data — the plate says so under
       them. The scatter is seeded ONCE per renderer (not per frame), or the
       points would boil. ── */
    const RSAMP = Array.from({ length: 26 }, (_, i) =>
      ({ u: (i + .5) / 26, e: (rnd() - .5) * .06 }));
    const WSAMP = Array.from({ length: 22 }, (_, i) =>
      ({ lg: -1 + 2 * (i + .5) / 22, e: (rnd() - .5) * .085 }));

    // one drafted plot frame — L-shaped axes, the 0/1 y-range called out, a
    // title over it and both axis names — so the two registers read as a pair
    const frame = (ctx, x0, y0, x1, y1, title, xlab, ylab) => {
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1);
      ctx.moveTo(x0 - 3 * DPR, y0); ctx.lineTo(x0, y0);
      ctx.stroke();
      mono(ctx, 6.6); ctx.fillStyle = INKA(.44); ctx.textAlign = "center";
      ctx.fillText(title, (x0 + x1) / 2, y0 - 9 * DPR);
      mono(ctx, 6); ctx.fillStyle = INKA(.32);
      ctx.fillText(xlab, (x0 + x1) / 2, y1 + 19 * DPR);
      ctx.save(); ctx.translate(x0 - 16 * DPR, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(ylab, 0, 0); ctx.restore();
      mono(ctx, 5.6); ctx.fillStyle = INKA(.3); ctx.textAlign = "right";
      ctx.fillText("1", x0 - 5 * DPR, y0 + 3 * DPR);
      ctx.fillText("0", x0 - 5 * DPR, y1 + 2 * DPR);
      ctx.textAlign = "center";
    };
    // the coil–stretch transition: steady fractional extension against Wi
    const ext = (wi) => .08 + .92 / (1 + Math.exp(-2.6 * (Math.log10(wi) - Math.log10(.45))));

    return (ctx, w, h, t) => {
      if (!A) seed();
      step(t);
      ctx.clearRect(0, 0, w, h);
      const compact = Math.min(w, h) / DPR < 340;
      const cx = w / 2, cy = h * (compact ? .5 : .255);
      // a ring drawn fully out is HALF ITS CONTOUR long, and there are two of
      // them end to end — so the widest the pair can ever be is known up front
      const SPAN = 2.5 * L0 * N / TAU * Math.PI;
      // Sized DOWN three times at Felicia's request (.74 → .62 → .54 → .46, and
      // .88 → .62 in compact) so the ELONGATIONAL FIELD label above it reads as a
      // caption with air around it rather than as type sitting on the streamlines.
      const S = (compact ? w * .62 : w * .46) / SPAN;
      const X = (x) => cx + x * S, Y = (y) => cy + y * S;
      // the flow field, first and underneath, clipped to the figure register so
      // it can't run down into the distance matrix below
      // the FIELD's extent is in screen space, so it has to come down with the
      // drawing — otherwise the streamlines keep filling the plate and the label
      // still has nothing to sit clear of
      const ymax = (compact ? h * .27 : h * .115) / S, xmax = w * .32 / S;
      ctx.save();
      ctx.beginPath();
      // the clip is looser than the field's own extent, so the streamlines end
      // where the flow does and never on a visible straight cut
      ctx.rect(0, compact ? h * .22 : h * .155, w, compact ? h * .58 : h * .25);
      ctx.clip();
      field(ctx, X, Y, S, rate / (RATES.length - 1), xmax, ymax);
      ctx.restore();
      // FLAT: each chain is drawn as one run of segments, each with a paper halo
      // beneath it so where the two loops cross they read as separated lines
      // rather than as a merge. Chain 2 is laid over chain 1, consistently.
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      [[A, A1], [B, A2]].forEach(([r, col]) => {
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < N; i++) {
            const a = r[i], b = r[(i + 1) % N];
            if (pass === 0) {
              ctx.strokeStyle = PAPER; ctx.lineWidth = 5.2 * DPR;
            } else {
              // the gradient runs along the contour, as it does in the source video
              const u = Math.abs(1 - 2 * i / N), l = .12 + .46 * u;
              ctx.strokeStyle = `rgb(${Math.round(col[0] + (255 - col[0]) * l * .8)},` +
                `${Math.round(col[1] + (255 - col[1]) * l * .8)},` +
                `${Math.round(col[2] + (255 - col[2]) * l * .8)})`;
              ctx.lineWidth = 2.4 * DPR;
            }
            ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
          }
        }
        // the beads themselves, so the chain reads as discrete monomers
        for (let i = 0; i < N; i++) {
          const u = Math.abs(1 - 2 * i / N), l = .12 + .46 * u;
          ctx.fillStyle = `rgb(${Math.round(col[0] + (255 - col[0]) * l * .8)},` +
            `${Math.round(col[1] + (255 - col[1]) * l * .8)},` +
            `${Math.round(col[2] + (255 - col[2]) * l * .8)})`;
          ctx.beginPath(); ctx.arc(X(r[i].x), Y(r[i].y), 2 * DPR, 0, TAU); ctx.fill();
        }
      });
      // The label that names the field drawn under the chains — same style and
      // same place on the plate as the fluidised bed's own label, and like that
      // one it is drawn BEFORE the compact bail-out. It used to sit after it, so
      // the whole label vanished on any short viewport (the hero canvas drops
      // under the 340px compact threshold on a laptop with a shallow window) —
      // which is exactly the plate Felicia was looking at when she reported the
      // label missing. Keep it above `if (compact) return`.
      mono(ctx, 7.6); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = INKA(.45);
      // Sits LOW enough to clear the frame's own caption ("POLYMER HYDRODYNAMICS",
      // an HTML label positioned over the top-left of the frame). At h*.055 the two
      // lines of type were ~19px apart and read as one stacked heading.
      ctx.fillText("ELONGATIONAL FIELD", cx, h * (compact ? .155 : .105));

      if (compact) return;

      // ── the strain rate the plate is currently at (the video's three panels,
      //    cycled through instead of drawn side by side) ──
      const sx = w * .32, sw = w * .36, sy = h * .42;
      ctx.strokeStyle = INKA(.22); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.stroke();
      mono(ctx, 6.8);
      RATES.forEach((r, i) => {
        const x = sx + sw * i / (RATES.length - 1), on = i === rate;
        ctx.strokeStyle = on ? "rgba(122,63,240,.9)" : INKA(.22);
        ctx.lineWidth = (on ? 1.8 : 1) * DPR;
        ctx.beginPath(); ctx.moveTo(x, sy - (on ? 6 : 3.5) * DPR); ctx.lineTo(x, sy + (on ? 6 : 3.5) * DPR);
        ctx.stroke();
        ctx.fillStyle = on ? "rgba(122,63,240,.95)" : INKA(.3);
        ctx.fillText(r.n, x, sy + 17 * DPR);
      });
      mono(ctx, 7.2); ctx.fillStyle = INKA(.42); ctx.textAlign = "right";
      ctx.fillText("STRETCH RATE  ε̇", sx - 12 * DPR, sy + 3 * DPR);

      // ── the two result registers, side by side, where the pairwise-distance
      //    heat map used to sit. Neither is measured data; that is stated
      //    directly under them. ──
      const pt = h * .558, pb = h * .828;
      const q1a = w * .125, q1b = w * .455, q2a = w * .585, q2b = w * .915;

      /* (i) RELAXATION TIME — the squared fractional extension of a pair
         released from stretch, decaying toward its equilibrium coil value. τ is
         constructed on the plot (1/e of the initial excess) rather than merely
         asserted, and a cursor walks the trace so the register moves with the
         rest of the plate. */
      frame(ctx, q1a, pt, q1b, pb, "RELAXATION TIME", "TIMESTEP", "(x/L)²");
      const Y0 = .64, YE = .06, TR = .30;
      const rlx = (u) => YE + (Y0 - YE) * Math.exp(-u / TR);
      const AX = (u) => q1a + u * (q1b - q1a), AY = (v) => pb - v * (pb - pt);
      ctx.save(); ctx.setLineDash([2.5 * DPR, 3 * DPR]);
      ctx.strokeStyle = INKA(.26); ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(q1a, AY(rlx(TR))); ctx.lineTo(AX(TR), AY(rlx(TR))); ctx.lineTo(AX(TR), pb);
      ctx.stroke(); ctx.restore();
      mono(ctx, 6.2); ctx.fillStyle = "rgba(122,63,240,.85)"; ctx.textAlign = "center";
      ctx.fillText("τ", AX(TR), pb + 9 * DPR);
      ctx.strokeStyle = "rgba(122,63,240,.85)"; ctx.lineWidth = 1.6 * DPR;
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) { const u = i / 90;
        i ? ctx.lineTo(AX(u), AY(rlx(u))) : ctx.moveTo(AX(u), AY(rlx(u))); }
      ctx.stroke();
      ctx.fillStyle = "rgba(122,63,240,.45)";
      for (const p of RSAMP) { ctx.beginPath();
        ctx.arc(AX(p.u), AY(clamp(rlx(p.u) + p.e, .02, .98)), 1.7 * DPR, 0, TAU); ctx.fill(); }
      const cu = (t * .13) % 1;
      ctx.fillStyle = "rgba(122,63,240,1)";
      ctx.beginPath(); ctx.arc(AX(cu), AY(rlx(cu)), 2.6 * DPR, 0, TAU); ctx.fill();

      /* (ii) Wi ANALYSIS — steady x-extension against Weissenberg number: the
         coil–stretch transition. The rate the plate is running RIGHT NOW sits on
         that curve as a lit point, so the animation and this register are one
         experiment rather than two unrelated pictures. */
      frame(ctx, q2a, pt, q2b, pb, "Wi ANALYSIS", "Wi   ( log )", "x / L");
      const BX = (lg) => q2a + (lg + 1) / 2 * (q2b - q2a);
      const BY = (v) => pb - v * (pb - pt);
      ctx.strokeStyle = "rgba(208,68,168,.85)"; ctx.lineWidth = 1.6 * DPR;
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) { const lg = -1 + 2 * i / 90;
        const x = BX(lg), y = BY(ext(Math.pow(10, lg)));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = "rgba(208,68,168,.45)";
      for (const p of WSAMP) { ctx.beginPath();
        ctx.arc(BX(p.lg), BY(clamp(ext(Math.pow(10, p.lg)) + p.e, .02, .98)), 1.7 * DPR, 0, TAU);
        ctx.fill(); }
      mono(ctx, 5.6); ctx.textAlign = "center";
      for (const [lg, lab] of [[-1, "0.1"], [0, "1"], [1, "10"]]) {
        ctx.strokeStyle = INKA(.25); ctx.lineWidth = 1 * DPR;
        ctx.beginPath(); ctx.moveTo(BX(lg), pb); ctx.lineTo(BX(lg), pb + 3 * DPR); ctx.stroke();
        ctx.fillStyle = INKA(.3); ctx.fillText(lab, BX(lg), pb + 10 * DPR);
      }
      const wiN = RATES[rate].wi, wx = BX(Math.log10(wiN)), wy = BY(ext(wiN));
      ctx.save(); ctx.setLineDash([2.5 * DPR, 3 * DPR]);
      ctx.strokeStyle = "rgba(208,68,168,.5)"; ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(q2a, wy); ctx.lineTo(wx, wy); ctx.lineTo(wx, pb);
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = "rgba(208,68,168,1)";
      ctx.beginPath(); ctx.arc(wx, wy, 3 * DPR, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath(); ctx.arc(wx, wy, 3 * DPR, 0, TAU); ctx.stroke();
      // the callout flips to the inside once the point is past mid-axis, so it
      // can never run off the plot's right edge at FAST
      const flip = wx > (q2a + q2b) / 2;
      mono(ctx, 6); ctx.fillStyle = "rgba(208,68,168,.9)";
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillText(RATES[rate].n + "  Wi " + wiN.toFixed(2),
        wx + (flip ? -7 : 7) * DPR, wy - 6 * DPR);

      // these are trends, not measurements — the shared footer says so
      notes(ctx, w, h, "2-CATENANE RINGS  /  ELONGATIONAL FLOW  /  SIMULATION STUDY");
    };
  })();

  /* ══ 05 · HYPERSPECTRAL IMAGING · IDENTIFY + QUANTIFY ══════════════════════
     Flakes of a POLYPROPYLENE-BASED BLEND ride a belt through an illuminated
     NIR line scan; the camera reads R(λ); the model returns not a class name
     but a COMPOSITION — how much polypropylene, polyethylene, talc and flame
     retardant the flake carries. That is the actual subject of the paper this
     plate belongs to ("identification AND quantification of multi-component
     polypropylene blends"), and it replaced a `CLASSIFIED · PET / HDPE / PP`
     readout at Felicia's request.

     The three-bin sorter went with it — air-jet bank, bins and ejection
     envelopes. Talc and a flame retardant are additives INSIDE a flake, not
     separate flakes, so there is nothing for a jet to sort and the bins were
     contradicting the readout beside them. The belt simply runs off the plate.

     The two registers are ONE measurement: the spectrum plots each component's
     signature faintly and the flake's own curve boldly, and that bold curve IS
     the weighted sum of the four — the same weights the composition bar splits.
     So the picture cannot say two different things. ══ */
  const hyper = (() => {
    // NIR signatures: a baseline minus each component's characteristic
    // absorption bands (the features an industrial NIR instrument keys on)
    const COMP = [
      { n: "POLYPROPYLENE",   c: "#2e7d4f", rgb: [46, 125, 79],  d: [[1195, .30, 42], [1370, .46, 62]] },
      { n: "POLYETHYLENE",    c: "#9bbf3b", rgb: [155, 191, 59], d: [[1215, .36, 44], [1400, .50, 70]] },
      { n: "TALC",            c: "#b0872b", rgb: [176, 135, 43], d: [[1390, .52, 30], [1600, .22, 90]] },
      { n: "FLAME RETARDANT", c: "#2b5fd0", rgb: [43, 95, 208],  d: [[1120, .40, 36], [1500, .34, 48]] },
    ];
    const NC = COMP.length, NF = 9;
    // one component's absorbance at λ, and the blend's reflectance from a whole
    // composition vector — the second is literally built from the first
    const absorb = (cl, lam) => {
      let a = 0;
      for (const b of cl.d) a += b[1] * Math.exp(-(((lam - b[0]) / b[2]) ** 2));
      return a;
    };
    const R = (cl, lam) => clamp(.86 - absorb(cl, lam), 0, 1);
    const Rmix = (wt, lam) => {
      let a = 0;
      for (let i = 0; i < NC; i++) a += wt[i] / 100 * absorb(COMP[i], lam);
      return clamp(.86 - a, 0, 1);
    };
    /* A plausible PP-based blend: polypropylene dominant, polyethylene the main
       second polymer, a mineral filler, and a few percent of flame retardant —
       normalised so the four always state 100 wt% and the bar is a whole. */
    const mkBlend = () => {
      const raw = [58 + rnd() * 26, 6 + rnd() * 19, 4 + rnd() * 13, 1.5 + rnd() * 6.5];
      const tot = raw[0] + raw[1] + raw[2] + raw[3];
      return raw.map((v) => v / tot * 100);
    };
    // the flake's own colour: its composition mixed and then taken most of the
    // way to a light grey, so a belt of them reads as plastic and not as paint
    const tint = (wt, a) => {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < NC; i++) {
        r += wt[i] / 100 * COMP[i].rgb[0];
        g += wt[i] / 100 * COMP[i].rgb[1];
        b += wt[i] / 100 * COMP[i].rgb[2];
      }
      const m = .62;                                  // …toward paper grey
      return `rgba(${Math.round(r + (196 - r) * m)},${Math.round(g + (194 - g) * m)},` +
             `${Math.round(b + (186 - b) * m)},${a})`;
    };
    let fk = null, read = null;
    const seed = () => {
      fk = Array.from({ length: NF }, (_, i) => ({
        x: i / NF * 1.22 - .12, wt: mkBlend(), w: .019 + rnd() * .013, r: rnd() * TAU }));
      read = fk[0].wt;                                // something on the register from frame 1
    };
    resets.push(() => { fk = null; });
    const SCAN = .40;                                 // the scan line, in belt-x
    return (ctx, w, h, t) => {
      if (!fk) seed();
      ctx.clearRect(0, 0, w, h);
      const compact = Math.min(w, h) / DPR < 340;
      const bx0 = w * .07, bx1 = w * .95, bw = bx1 - bx0;
      const by = h * (compact ? .50 : .44), bh = 5 * DPR;
      const X = (u) => bx0 + u * bw;

      // ── flakes: carried through the scan line, then off the end of the belt ──
      for (const f of fk) {
        const px = f.x; f.x += .0034; f.r += .004;
        if (px < SCAN && f.x >= SCAN) read = f.wt;    // this flake is the one being read
        if (f.x > 1.04) { f.x = -.12; f.wt = mkBlend(); }
      }

      // ── the belt: rollers, surface, and the tread that shows it running ──
      ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke();
      ctx.fillStyle = "rgba(24,23,18,.06)";
      ctx.fillRect(bx0, by, bw, bh);
      ctx.strokeStyle = INKA(.22); ctx.lineWidth = 1;
      ctx.beginPath();
      const tread = (t * 34) % 14;
      for (let x = bx0 - 14 * DPR; x < bx1; x += 14 * DPR) {
        const px = x + tread * DPR; if (px < bx0 || px > bx1) continue;
        ctx.moveTo(px, by); ctx.lineTo(px - bh, by + bh);
      }
      ctx.stroke();
      ctx.strokeStyle = INKA(.35); ctx.lineWidth = 1.2 * DPR;
      for (const rx of [bx0, bx1]) {
        ctx.beginPath(); ctx.arc(rx, by + bh + 7 * DPR, 7 * DPR, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx, by + bh + 7 * DPR);
        ctx.lineTo(rx + Math.cos(t * 3.4) * 7 * DPR, by + bh + 7 * DPR + Math.sin(t * 3.4) * 7 * DPR);
        ctx.stroke();
      }

      // ── the camera and its illumination ──
      // The camera rides high enough that its title lands at h*.075, level with
      // where every other plate opens. It used to sit at .185, which left the top
      // eighth of the frame blank and pushed the whole drawing up against the
      // registers — plainly lopsided in the hero, whose plate is ~16% smaller
      // than the research one and has less room to absorb it.
      const camx = X(SCAN), camy = h * (compact ? .24 : .145);
      ctx.strokeStyle = INKA(.5); ctx.lineWidth = 1.3 * DPR;
      const cwd = Math.max(30 * DPR, w * .07), cht = Math.max(16 * DPR, h * .045);
      ctx.fillStyle = PAPER;
      ctx.fillRect(camx - cwd / 2, camy - cht, cwd, cht);
      ctx.strokeRect(camx - cwd / 2, camy - cht, cwd, cht);
      ctx.fillStyle = "rgba(24,23,18,.1)";
      ctx.fillRect(camx - cwd * .16, camy, cwd * .32, 5 * DPR);
      ctx.strokeStyle = INKA(.35); ctx.lineWidth = 1 * DPR;
      ctx.strokeRect(camx - cwd * .16, camy, cwd * .32, 5 * DPR);
      // field of view + the illuminated scan line on the belt
      ctx.save(); ctx.setLineDash([3 * DPR, 3.4 * DPR]);
      ctx.strokeStyle = "rgba(46,125,79,.42)"; ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(camx - cwd * .16, camy + 5 * DPR); ctx.lineTo(camx - 13 * DPR, by);
      ctx.moveTo(camx + cwd * .16, camy + 5 * DPR); ctx.lineTo(camx + 13 * DPR, by);
      ctx.stroke(); ctx.restore();
      // the lamps AIM at the scan line — a fixed fan angle sent the rays past
      // the belt and read as a scribble rather than as illumination
      const lamp = (lx) => {
        const ly = camy - cht * .3;
        ctx.strokeStyle = INKA(.4); ctx.lineWidth = 1.1 * DPR;
        ctx.beginPath(); ctx.arc(lx, ly, 4.5 * DPR, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(176,135,43,.45)";
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          const tx = camx + k * 11 * DPR;
          const a = Math.atan2(by - ly, tx - lx);
          ctx.moveTo(lx + Math.cos(a) * 5.5 * DPR, ly + Math.sin(a) * 5.5 * DPR);
          ctx.lineTo(tx, by);
        }
        ctx.stroke();
      };
      lamp(camx - cwd * .95); lamp(camx + cwd * .95);
      ctx.strokeStyle = "rgba(46,125,79,.85)"; ctx.lineWidth = 1.6 * DPR;
      ctx.beginPath(); ctx.moveTo(camx, by - 3 * DPR); ctx.lineTo(camx, by + bh + 3 * DPR); ctx.stroke();

      // flakes, drawn last so they sit over the belt. Each is tinted by its OWN
      // blend, so the belt carries visibly different material rather than one
      // repeated shape; the one under the line is outlined.
      for (const f of fk) {
        if (f.x < 0 || f.x > 1.02) continue;
        const px = X(f.x), s = f.w * bw * .5, lit = Math.abs(f.x - SCAN) < .012;
        ctx.save(); ctx.translate(px, by - 2 * DPR); ctx.rotate(f.r);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = TAU * k / 5, rr = s * (.72 + (k % 2) * .38);
          k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * .8)
            : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * .8);
        }
        ctx.closePath();
        ctx.fillStyle = tint(f.wt, .9); ctx.fill();
        ctx.strokeStyle = lit ? "rgba(46,125,79,.95)" : INKA(.4);
        ctx.lineWidth = (lit ? 1.6 : 1.1) * DPR; ctx.stroke();
        ctx.restore();
      }

      mono(ctx, 7.6); ctx.textAlign = "center"; ctx.fillStyle = INKA(.45);
      ctx.fillText(compact ? "NIR LINE SCAN" : "NIR HYPERSPECTRAL LINE SCAN",
        camx, camy - cht - 9 * DPR);
      if (compact) return;

      // ── register A: the spectrum the camera is reading right now. The four
      //    component signatures sit faint underneath, and the BOLD curve is the
      //    flake's own — which is the weighted sum of exactly those four. ──
      rule(ctx, w * .07, w * .48, h * .545, "REFLECTANCE  R(λ)");
      const sx = w * .115, sw = w * .33, sy = h * .60, sh = h * .20;
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.stroke();
      const SY = (v) => sy + sh * (1 - clamp((v - .14) / .76, 0, 1) * .94);
      for (let i = 0; i < NC; i++) {
        ctx.strokeStyle = COMP[i].c; ctx.globalAlpha = .3; ctx.lineWidth = 1 * DPR;
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
          const lam = 950 + 750 * k / 40, px = sx + sw * k / 40;
          k ? ctx.lineTo(px, SY(R(COMP[i], lam))) : ctx.moveTo(px, SY(R(COMP[i], lam)));
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(24,23,18,.8)"; ctx.lineWidth = 1.8 * DPR;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const lam = 950 + 750 * k / 60, px = sx + sw * k / 60;
        k ? ctx.lineTo(px, SY(Rmix(read, lam))) : ctx.moveTo(px, SY(Rmix(read, lam)));
      }
      ctx.stroke();
      mono(ctx, 6.4); ctx.fillStyle = INKA(.34); ctx.textAlign = "left";
      ctx.fillText("950", sx, sy + sh + 12 * DPR);
      ctx.textAlign = "right"; ctx.fillText("1700 nm", sx + sw, sy + sh + 12 * DPR);
      ctx.textAlign = "left"; ctx.fillText("R", sx - 10 * DPR, sy + 6 * DPR);
      mono(ctx, 6); ctx.fillStyle = INKA(.3);
      ctx.fillText("MEASURED BLEND  /  COMPONENT SIGNATURES", sx, sy - 6 * DPR);

      // ── register B: what the model makes of it — a composition, not a class.
      //    A stacked bar, because these four are parts of ONE whole and always
      //    state 100 wt%; the legend carries the numbers. ──
      rule(ctx, w * .54, w * .95, h * .545, "COMPOSITION  ·  PREDICTED wt%");
      const gx0 = w * .565, gx1 = w * .945, gwd = gx1 - gx0;
      const gy = h * .598, gh = 12 * DPR;
      let acc = 0;
      for (let i = 0; i < NC; i++) {
        const seg = read[i] / 100 * gwd;
        ctx.fillStyle = COMP[i].c; ctx.globalAlpha = .78;
        ctx.fillRect(gx0 + acc, gy, seg, gh); ctx.globalAlpha = 1;
        if (i) { ctx.strokeStyle = PAPER; ctx.lineWidth = 1.2 * DPR;
          ctx.beginPath(); ctx.moveTo(gx0 + acc, gy); ctx.lineTo(gx0 + acc, gy + gh); ctx.stroke(); }
        acc += seg;
      }
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 1 * DPR;
      ctx.strokeRect(gx0, gy, gwd, gh);
      mono(ctx, 6); ctx.fillStyle = INKA(.32); ctx.textAlign = "left";
      ctx.fillText("0", gx0, gy + gh + 11 * DPR);
      ctx.textAlign = "right"; ctx.fillText("100 wt%", gx1, gy + gh + 11 * DPR);
      // one row per component, reading DOWN the register the way the bar reads
      // across it: colour chip, name, and the number the whole plate is about
      mono(ctx, 6.8);
      for (let i = 0; i < NC; i++) {
        const ly = h * (.668 + i * .038);
        ctx.fillStyle = COMP[i].c;
        ctx.fillRect(gx0, ly - 5.5 * DPR, 6 * DPR, 6 * DPR);
        ctx.textAlign = "left"; ctx.fillStyle = INKA(.44);
        ctx.fillText(COMP[i].n, gx0 + 12 * DPR, ly);
        ctx.textAlign = "right"; ctx.fillStyle = INKA(.66);
        ctx.fillText(read[i].toFixed(1) + " %", gx1, ly);
      }
      mono(ctx, 6); ctx.textAlign = "left"; ctx.fillStyle = INKA(.32);
      ctx.fillText("MODEL OUTPUT  ·  R² 0.96  ·  RMSE 1.2 wt%", gx0, h * .845);

      notes(ctx, w, h, "HYPERSPECTRAL IMAGING  /  ADDITIVES QUANTIFICATION  /  POLYMER RECYCLING");
    };
  })();

  /* ══ 06 · LACTIC-ACID BATCH FERMENTER ══════════════════════════════════════
     A jacketed batch STR converting food-waste hydrolysate to lactic acid.
     The vessel and the kinetics register share ONE batch clock: the broth
     darkens toward the product colour, the substrate drains and the biomass
     grows on the plot together, so the drawing states one consistent moment in
     the batch rather than two unrelated animations. ══ */
  const ferm = (() => {
    const NP = 62;
    const BROTH0 = [226, 216, 190], BROTH1 = [92, 138, 84];
    let pr = null;
    const seed = () => { pr = Array.from({ length: NP }, () => ({
      loop: (rnd() * 4) | 0, u: rnd(), s: .7 + rnd() * .6, r: .6 + rnd() * .8 })); };
    resets.push(() => { pr = null; });
    // batch kinetics — logistic growth, substrate drawn down, product tracking it
    const Sf = (u) => 1 / (1 + Math.exp(9 * (u - .46)));
    const Xf = (u) => .06 + .88 / (1 + Math.exp(-9.5 * (u - .40)));
    const Pf = (u) => .94 / (1 + Math.exp(-8.6 * (u - .52)));
    const SC = .8;                                  // −20%, per request
    const body = (ctx, w, h, t) => {
      const compact = Math.min(w, h) / DPR < 340;
      const u = (t * .045) % 1;                                   // batch progress
      const vx0 = compact ? w * .26 : w * .085, vw = compact ? w * .48 : w * .34;
      const vy0 = h * (compact ? .12 : .13), vy1 = h * (compact ? .82 : .78);
      const vh = vy1 - vy0, cx = vx0 + vw / 2, jt = 5 * DPR;
      const lvl = vy0 + vh * .21;                                 // broth surface (working volume)

      // ── broth, tinted by the product concentration ──
      const p = Pf(u);
      const bc = BROTH0.map((k, n) => Math.round(k + (BROTH1[n] - k) * p));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(vx0, lvl); ctx.lineTo(vx0, vy1 - vw * .16);
      ctx.quadraticCurveTo(cx, vy1 + vw * .1, vx0 + vw, vy1 - vw * .16);
      ctx.lineTo(vx0 + vw, lvl); ctx.closePath();
      ctx.clip();
      ctx.fillStyle = `rgba(${bc[0]},${bc[1]},${bc[2]},.32)`;
      ctx.fillRect(vx0, lvl, vw, vh);
      // the circulation the impellers drive — four loops, two per impeller
      const im = [vy0 + vh * .52, vy0 + vh * .78];
      const loops = [
        { x: vx0 + vw * .27, y: im[0], rx: vw * .22, ry: vh * .17, d: -1 },
        { x: vx0 + vw * .73, y: im[0], rx: vw * .22, ry: vh * .17, d: 1 },
        { x: vx0 + vw * .27, y: im[1], rx: vw * .22, ry: vh * .13, d: -1 },
        { x: vx0 + vw * .73, y: im[1], rx: vw * .22, ry: vh * .13, d: 1 },
      ];
      ctx.save(); ctx.setLineDash([2.4 * DPR, 3.4 * DPR]);
      ctx.strokeStyle = "rgba(24,23,18,.14)"; ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      for (const L of loops) ctx.ellipse(L.x, L.y, L.rx, L.ry, 0, 0, TAU);
      ctx.stroke(); ctx.restore();
      for (const q of pr) {
        const L = loops[q.loop];
        q.u += .0055 * q.s * L.d;
        const a = q.u * TAU;
        const px = L.x + Math.cos(a) * L.rx * q.r, py = L.y + Math.sin(a) * L.ry * q.r;
        ctx.fillStyle = `rgba(46,125,79,${(.2 + .35 * p).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, 2.2 * DPR, 0, TAU); ctx.fill();
      }
      ctx.restore();

      // ── vessel shell: dished bottom, straight sides, jacket ──
      const shell = (o) => {
        ctx.beginPath();
        ctx.moveTo(vx0 - o, vy0); ctx.lineTo(vx0 - o, vy1 - vw * .16);
        ctx.quadraticCurveTo(cx, vy1 + vw * .1 + o, vx0 + vw + o, vy1 - vw * .16);
        ctx.lineTo(vx0 + vw + o, vy0);
        ctx.stroke();
      };
      ctx.strokeStyle = INKA(.5); ctx.lineWidth = 1.4 * DPR; shell(0);
      // top head — without it the vessel reads as an open tube, not a closed batch
      ctx.beginPath();
      ctx.moveTo(vx0, vy0); ctx.quadraticCurveTo(cx, vy0 - vw * .13, vx0 + vw, vy0); ctx.stroke();
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR; shell(jt);
      ctx.strokeStyle = INKA(.14); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = vy0 + 4 * DPR; y < vy1 - vw * .18; y += 6.5 * DPR) {
        ctx.moveTo(vx0 - jt, y); ctx.lineTo(vx0, y + jt);
        ctx.moveTo(vx0 + vw + jt, y); ctx.lineTo(vx0 + vw, y + jt);
      }
      ctx.stroke();
      // broth surface
      ctx.strokeStyle = INKA(.35); ctx.lineWidth = 1.1 * DPR;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) { const x = vx0 + vw * k / 20;
        const y = lvl + Math.sin(k * .9 + t * 2.2) * 1.6 * DPR;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      // baffles
      ctx.strokeStyle = INKA(.3); ctx.lineWidth = 2.4 * DPR;
      ctx.beginPath();
      ctx.moveTo(vx0 + vw * .06, lvl); ctx.lineTo(vx0 + vw * .06, vy1 - vw * .2);
      ctx.moveTo(vx0 + vw * .94, lvl); ctx.lineTo(vx0 + vw * .94, vy1 - vw * .2);
      ctx.stroke();

      // ── agitator: shaft, motor, two rotating Rushton turbines ──
      ctx.strokeStyle = INKA(.55); ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath(); ctx.moveTo(cx, vy0 - h * .05); ctx.lineTo(cx, im[1] + vh * .05); ctx.stroke();
      ctx.lineWidth = 1.2 * DPR; ctx.strokeStyle = INKA(.45); ctx.fillStyle = PAPER;
      const mw = Math.max(20 * DPR, vw * .3), mh = Math.max(10 * DPR, h * .032);
      ctx.fillRect(cx - mw / 2, vy0 - h * .05 - mh, mw, mh);
      ctx.strokeRect(cx - mw / 2, vy0 - h * .05 - mh, mw, mh);
      mono(ctx, 6.4); ctx.textAlign = "center"; ctx.fillStyle = INKA(.4);
      ctx.fillText("M", cx, vy0 - h * .05 - mh * .3);
      const Rd = vw * .19, w2 = t * 2.6;
      for (const iy of im) {
        ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.2 * DPR;
        ctx.beginPath(); ctx.moveTo(cx - Rd, iy); ctx.lineTo(cx + Rd, iy); ctx.stroke();   // disc
        for (let k = 0; k < 6; k++) {
          const a = w2 + k * TAU / 6, px = cx + Math.cos(a) * Rd;
          const front = Math.sin(a) > 0;
          ctx.fillStyle = front ? "rgba(24,23,18,.34)" : "rgba(24,23,18,.13)";
          ctx.fillRect(px - 1.6 * DPR, iy - 4.5 * DPR, 3.2 * DPR, 9 * DPR);
        }
        // radial discharge
        ctx.strokeStyle = "rgba(46,125,79,.5)"; ctx.lineWidth = 1.1 * DPR;
        ctx.beginPath();
        ctx.moveTo(cx + Rd + 3 * DPR, iy); ctx.lineTo(cx + Rd + 13 * DPR, iy);
        ctx.moveTo(cx - Rd - 3 * DPR, iy); ctx.lineTo(cx - Rd - 13 * DPR, iy);
        ctx.stroke();
        head(ctx, cx + Rd + 13 * DPR, iy, 0, 3 * DPR);
        head(ctx, cx - Rd - 13 * DPR, iy, Math.PI, 3 * DPR);
      }

      // ── nozzles: feed in, base for pH control, probes, product out ──
      const noz = (x, y, dx, dy, lab, align) => {
        ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.2 * DPR;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
        head(ctx, x, y, Math.atan2(-dy, -dx), 3.4 * DPR);
        if (compact) return;
        mono(ctx, 6.6); ctx.textAlign = align; ctx.fillStyle = INKA(.4);
        ctx.fillText(lab, x + dx + (align === "right" ? -4 * DPR : 4 * DPR), y + dy + 2.4 * DPR);
      };
      noz(vx0 + vw * .22, vy0 - vw * .09, -w * .055, -h * .055, "FOOD WASTE", "right");
      noz(vx0 + vw * .78, vy0 - vw * .09, w * .07, -h * .05, "NaOH · pH 6.0", "left");
      // probes
      ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath();
      ctx.moveTo(vx0 + vw + jt, lvl + vh * .1); ctx.lineTo(vx0 + vw * .82, lvl + vh * .16);
      ctx.moveTo(vx0 - jt, lvl + vh * .3); ctx.lineTo(vx0 + vw * .18, lvl + vh * .36);
      ctx.stroke();
      if (!compact) {
        mono(ctx, 6.6); ctx.fillStyle = INKA(.4);
        ctx.textAlign = "left"; ctx.fillText("pH", vx0 + vw + jt + 5 * DPR, lvl + vh * .1);
        ctx.textAlign = "right"; ctx.fillText("T = 37 °C", vx0 - jt - 5 * DPR, lvl + vh * .3);
      }
      // product draw-off
      ctx.strokeStyle = INKA(.45); ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath(); ctx.moveTo(cx, vy1 + vw * .06); ctx.lineTo(cx, vy1 + h * .06); ctx.stroke();
      head(ctx, cx, vy1 + h * .06, Math.PI / 2, 3.4 * DPR);

      // The plate's title used to sit at h*.93, which is where the shared caveat
      // line now runs — it moves up, and the broth label moves off the centre
      // line to label the draw-off arrow it actually belongs to.
      mono(ctx, 7.6); ctx.textAlign = "center"; ctx.fillStyle = INKA(.45);
      ctx.fillText(compact ? "BATCH FERMENTER" : "BATCH FERMENTER · SECTION", cx, h * .885);
      if (compact) return;
      mono(ctx, 6.6); ctx.fillStyle = INKA(.38); ctx.textAlign = "left";
      ctx.fillText("LACTIC ACID BROTH", cx + 9 * DPR, vy1 + h * .055);
      ctx.textAlign = "center";

      // ── register: the batch curves, with a cursor on the current moment ──
      rule(ctx, w * .5, w * .96, h * .10, "BATCH KINETICS");
      const gx = w * .58, gw = w * .33, gy = h * .17, gh = h * .30;
      ctx.strokeStyle = INKA(.28); ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
      const curve = (f, col, lw) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw * DPR;
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) { const v = k / 40;
          const px = gx + gw * v, py = gy + gh * (1 - f(v));
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      };
      curve(Sf, "rgba(24,23,18,.34)", 1.3);
      curve(Xf, "rgba(155,191,59,.85)", 1.4);
      curve(Pf, "rgba(46,125,79,.9)", 1.8);
      ctx.strokeStyle = "rgba(46,125,79,.45)"; ctx.lineWidth = 1 * DPR;
      ctx.beginPath(); ctx.moveTo(gx + gw * u, gy); ctx.lineTo(gx + gw * u, gy + gh); ctx.stroke();
      [[Sf, "rgba(24,23,18,.5)"], [Xf, "#9bbf3b"], [Pf, "#2e7d4f"]].forEach(([f, c]) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(gx + gw * u, gy + gh * (1 - f(u)), 2.6 * DPR, 0, TAU); ctx.fill();
      });
      mono(ctx, 6.6); ctx.fillStyle = INKA(.34); ctx.textAlign = "left";
      ctx.fillText("0", gx, gy + gh + 12 * DPR);
      ctx.textAlign = "right"; ctx.fillText("48 h", gx + gw, gy + gh + 12 * DPR);
      // the legend sits UNDER the axis, clear of the curves' own origin corner
      mono(ctx, 6.8); ctx.textAlign = "left";
      const lx0 = gx, ly0 = gy + gh + 26 * DPR;
      [["P  LACTIC ACID", "rgba(46,125,79,.9)"], ["X  BIOMASS", "rgba(140,170,52,1)"],
       ["S  SUBSTRATE", INKA(.42)]].forEach(([lab, col], i) => {
        ctx.fillStyle = col; ctx.fillText(lab, lx0 + i * gw * .34, ly0); });

      rule(ctx, w * .5, w * .96, h * .55, "STOICHIOMETRY");
      mono(ctx, 8); ctx.textAlign = "center"; ctx.fillStyle = INKA(.5);
      ctx.fillText("C₆H₁₂O₆  →  2 CH₃CH(OH)COOH", w * .73, h * .615);
      mono(ctx, 6.8); ctx.fillStyle = INKA(.36);
      ctx.fillText("GLUCOSE  →  L-(+)-LACTIC ACID", w * .73, h * .655);
      mono(ctx, 7); ctx.fillStyle = "rgba(46,125,79,.8)";
      ctx.fillText("YIELD  Y      = " + (0.9 * p).toFixed(2) + " g g⁻¹", w * .73, h * .71);
      mono(ctx, 5.4); ctx.fillStyle = INKA(.4);
      ctx.fillText("P/S", w * .73 - 22 * DPR, h * .716);

      notes(ctx, w, h, "BATCH  /  Lactobacillus sp.  /  37 °C  /  pH 6.0 (NaOH)  /  ANAEROBIC");
    };
    return plate(SC, (t) => { if (!pr) seed(); return t; }, body);
  })();

  return { node, fbed, cadf, rings, hyper, ferm, reset: () => resets.forEach((f) => f()) };
}

/* "is this section on screen?", as a predicate. BOTH canvas loops stop drawing
   when their section scrolls away — there is no point rendering a figure behind
   another section, and it frees the frame for the one that IS on screen. Where
   IntersectionObserver is missing this reports `true` forever, so a figure can
   never end up permanently frozen. */
function onScreen(el, threshold) {
  let vis = true;
  if ("IntersectionObserver" in window && el)
    new IntersectionObserver((e) => { vis = e[0].isIntersecting; }, { threshold }).observe(el);
  return () => vis;
}

/* ─────────────────────────────────────────────────────────────
   HERO right-side visuals — the active renderer draws to its canvas
   ───────────────────────────────────────────────────────────── */
let activeViz = "node";
function initHeroViz() {
  const DPR = Math.min(2, devicePixelRatio || 1);
  const setups = {};
  $$(".vz").forEach((cv) => {
    const ctx = cv.getContext("2d");
    const fit = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, r.width * DPR); cv.height = Math.max(1, r.height * DPR);
    };
    fit();
    setups[cv.dataset.viz] = { cv, ctx, fit };
  });
  addEventListener("resize", () => Object.values(setups).forEach((s) => s.fit()));
  const draw = createRenderers(DPR);

  const hero = $("#home");
  const heroVisible = onScreen(hero, 0.01);

  let t = 0;
  // under reduced motion the figure is drawn ONCE and left standing — a blank
  // plate would be worse than a still one, and the controls can still start it
  let paused = reduced;
  const frame = () => {
    const s = setups[activeViz];
    if (s && s.cv.width > 1) draw[activeViz](s.ctx, s.cv.width, s.cv.height, t);
  };
  heroDrawOnce = frame;
  heroIsPaused = () => paused;
  const syncBar = () => hero && hero.classList.toggle("is-viz-paused", paused);
  initVizControls($(".hero__viz"), {
    paused: () => paused,
    toggle: () => { paused = !paused; syncBar(); if (!paused && cycleHold) cycleHold(); },
    // restarting the figure restarts its countdown too, so the indicator and the
    // diagram always share one clock
    restart: () => { t = 0; draw.reset(); frame(); if (cycleHold) cycleHold(); },
  });
  syncBar();

  const loop = () => {
    if (!paused && heroVisible()) { t += 0.016; frame(); }
    requestAnimationFrame(loop);
  };
  frame();          // first frame immediately, so the plate is never empty
  loop();
}

/* ─────────────────────────────────────────────────────────────
   RESEARCH — scroll-progress storytelling (sticky pin in CSS)
   ───────────────────────────────────────────────────────────── */
const rxSection = $("#research");
const rxTexts = $$(".rxt"), rSteps = $$(".rstep"), rxGhost = $("#rxGhost");
const rxPick = $("#rxPick");
const rxHead = $("#rxHead");
let rxChapter = -1, rxArea = "", rxVizKey = "node", rxDrawOnce = null;

/* the story runs over SIX chapters but only THREE headings: scrolling inside an
   area swaps the figure, the project title and the body copy while its heading,
   tab and accent stay put, so a multi-plate area reads as one topic whose
   projects follow one another. Each chapter names its own project in `.rxt__proj`
   — that is what makes ML's three projects read as three, not as one. */
/* all three headings run on ONE line — the type is sized so the longest of them
   fits, and a hand-broken heading made the three chapters sit at different
   heights, which is what read as inconsistent between the tabs */
const RX_HEAD = {
  ml:    "Machine Learning &amp; Computation",
  poly:  "Polymer Physics",
  waste: "Waste Management",
};
/* each chapter owns an equal band of the section's scroll */
const rxIndexAt = (p) => clamp(Math.floor(p * FIGS.length), 0, FIGS.length - 1);

/* Is the story actually PINNED? Ask the CSS, don't infer it from height: the
   stacked layout is far taller than the viewport too, so a height test reports
   "pinned" on a phone. `.rx__pin` is `position:sticky` above the breakpoint and
   `relative` below it; that is the fact we want. Cached and re-read on resize,
   since it is consulted from the scroll path. */
const rxPin = $(".rx__pin");
let rxIsPinned = true;
const rxSyncPinned = () => {
  rxIsPinned = !!rxPin && getComputedStyle(rxPin).position === "sticky";
};

/* Paint chapter `idx` — the plate, its caption and figure number, the active
   tab, the heading, the picker and which body copy is shown.

   ONE function for both layouts. Pinned, the scroll position chooses the index;
   unpinned, the picker does. These were two near-copies (`updateResearch` and a
   separate mobile `rxShow`) that had already drifted: only one of them switched
   the body copy, which is why the phone showed all six chapters at once. */
function rxApply(idx) {
  if (!rxSection) return;
  idx = clamp(idx, 0, FIGS.length - 1);
  if (idx === rxChapter) return;
  rxChapter = idx;
  const f = FIGS[idx], area = f.area, ai = ORDER.indexOf(area);
  rxVizKey = f.viz;                                // the plate follows the chapter
  rxTexts.forEach((c, k) => c.classList.toggle("is-active", k === idx));
  rSteps.forEach((s, k) => s.classList.toggle("is-active", k === ai));
  rxPickBuild(idx);
  if (rxGhost) rxGhost.textContent = f.fig;
  // the heading is only rewritten when the AREA changes, so moving between two
  // plates of the same area leaves it visibly untouched
  if (area !== rxArea) {
    rxArea = area;
    if (rxHead) rxHead.innerHTML = RX_HEAD[area];
    rxSection.dataset.tone = area;
    setTheme(area);
  }
  const lbl = $("#rxVizLabel"); if (lbl) lbl.textContent = f.label;
  const fig = $("#rxVizFig"); if (fig) fig.textContent = "FIG · " + f.fig;
  if (rxDrawOnce) rxDrawOnce();     // so a paused plate still follows the chapter
}

function updateResearch(y) {
  // unpinned there is no scroll travel to map onto — the picker drives instead
  if (!rxSection || !rxIsPinned) return;
  const scrollable = rxSection.offsetHeight - innerHeight;
  if (scrollable <= 0) return;
  rxApply(rxIndexAt(clamp((y - rxSection.offsetTop) / scrollable, 0, 1)));
}

/* go to chapter `i` — by scrolling to its band when pinned, directly when not */
function rxToChapter(i) {
  if (!rxIsPinned) return rxApply(i);
  const scrollable = rxSection.offsetHeight - innerHeight;
  programmaticScroll(rxSection.offsetTop + scrollable * ((i + 0.5) / FIGS.length));
}

/* The figure picker sits directly under the topic tabs, listing figures by NAME
   — a reader choosing between two diagrams wants their names, not their indices.
   Pinned it lists the current topic's plates; unpinned there is no current topic
   and it lists all six, because it is then the section's only navigation. */
let rxPickArea = "";
function rxPickBuild(idx) {
  if (!rxPick) return;
  const area = FIGS[idx].area;
  const all = !rxIsPinned;
  const key = all ? "*" : area;
  if (key !== rxPickArea) {
    rxPickArea = key;
    const mine = FIGS.map((f, i) => ({ f, i })).filter((o) => all || o.f.area === area);
    rxPick.innerHTML = mine.map((o) =>
      '<button class="rx__pickb" data-chap="' + o.i + '" type="button">' +
        '<em>' + o.f.fig + '</em><span>' + o.f.label + '</span></button>').join("");
    $$(".rx__pickb", rxPick).forEach((b) =>
      b.addEventListener("click", () => rxToChapter(+b.dataset.chap)));
  }
  $$(".rx__pickb", rxPick).forEach((b) =>
    b.classList.toggle("is-active", +b.dataset.chap === idx));
}

function initResearch() {
  rxSyncPinned();
  // a tab lands on its area's FIRST chapter
  rSteps.forEach((s) => s.addEventListener("click", () => rxToChapter(AREA_START[+s.dataset.step])));
  rxApply(0);
  // a width change can flip pinned↔unpinned, which changes both what the picker
  // lists and who is driving the chapter — rebuild it for the new layout
  addEventListener("resize", () => {
    rxSyncPinned();
    rxPickArea = "";
    rxPickBuild(rxChapter < 0 ? 0 : rxChapter);
  });
}

/* ─────────────────────────────────────────────────────────────
   RESEARCH visual — a 2D canvas that renders the SAME renderer as the
   active topic (so the diagram always matches the selected chapter).
   ───────────────────────────────────────────────────────────── */
function initResearchViz() {
  const cv = $("#rxCanvas");
  if (!cv) return;
  // this canvas is the largest on the page; cap its backing resolution at 1.5×
  // (line art stays crisp) so the per-frame fill cost stays reasonable on HiDPI
  const DPR = Math.min(1.5, devicePixelRatio || 1);
  const ctx = cv.getContext("2d");
  // Resize the backing store ONLY when the box actually changes — reassigning
  // canvas.width every frame reallocates the buffer and forces layout, which was
  // making the (large) research canvas stutter. ResizeObserver handles the
  // 0-height init and any viewport resize; the render loop never touches size.
  let cw = 0, ch = 0;
  const fit = () => {
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * DPR)), h = Math.max(1, Math.round(r.height * DPR));
    if (w !== cw || h !== ch) { cw = cv.width = w; ch = cv.height = h; }
  };
  fit();
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(cv);
  else addEventListener("resize", fit);
  const draw = createRenderers(DPR);
  const visible = onScreen(rxSection, 0.02);
  let t = 0, paused = reduced;
  const frame = () => { if (cv.width > 1) draw[rxVizKey](ctx, cv.width, cv.height, t); };
  rxDrawOnce = frame;                       // chapter changes repaint a paused plate
  initVizControls($(".rx__viz"), {
    paused: () => paused,
    toggle: () => { paused = !paused; },
    restart: () => { t = 0; draw.reset(); frame(); },
  });
  const loop = () => {
    if (!paused && visible()) { t += 0.016; frame(); }
    requestAnimationFrame(loop);
  };
  if ("ResizeObserver" in window) new ResizeObserver(frame).observe(cv);   // repaint after a resize while paused
  frame();
  loop();
}

/* ─────────────────────────────────────────────────────────────
   MOBILE MENU — the hamburger toggles a full-screen drafted overlay
   ───────────────────────────────────────────────────────────── */
function initMenu() {
  const toggle = $("#navToggle"), links = $$(".nav__links a");
  if (!toggle) return;
  links.forEach((a, i) => a.style.setProperty("--i", i));      // stagger the overlay reveal
  const set = (open) => {
    document.body.classList.toggle("nav-open", open);
    // hard scroll-lock on the root: stops native touch scroll leaking behind the
    // overlay on mobile (lenis.stop() can't, since smoothTouch is off) — this was
    // the "disoriented" menu bug when opened after scrolling
    document.documentElement.classList.toggle("nav-lock", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  toggle.addEventListener("click", () => set(!document.body.classList.contains("nav-open")));
  links.forEach((a) => a.addEventListener("click", () => set(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  addEventListener("resize", () => { if (innerWidth > 880) set(false); });
}

/* ─────────────────────────────────────────────────────────────
   ATMOSPHERE — the fixed ambient light drifts with SCROLL (depth) and eases
   toward the POINTER, so the page feels lit by a real environment that responds
   to the viewer. Transform-only on a fixed layer → stays on the compositor.
   ───────────────────────────────────────────────────────────── */
function initAtmosphere() {
  const atmo = $("#atmo"), tint = $(".atmo__tint"), bounce = $(".atmo__bounce");
  if (reduced || !atmo) return;
  let px = 0, py = 0, tx = 0, ty = 0, lastS = null;
  if (canHover) addEventListener("pointermove", (e) => {
    tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });
  const loop = () => {
    px = lerp(px, tx, 0.045); py = lerp(py, ty, 0.045);
    atmo.style.transform = `translate3d(${(px * 16).toFixed(2)}px,${(py * 12).toFixed(2)}px,0)`;
    // two planes, two rates: the ambient tint recedes upward as you scroll while
    // the floor bounce trails downward. Transform-only, and only written when the
    // value actually changes, so this stays a compositor-side move.
    const s = -Math.min(window.scrollY * 0.025, 180);
    if (s !== lastS) {
      if (tint) tint.style.transform = `translate3d(0,${s.toFixed(1)}px,0)`;
      if (bounce) bounce.style.transform = `translate3d(0,${(-s * 0.42).toFixed(1)}px,0)`;
      lastS = s;
    }
    requestAnimationFrame(loop);
  };
  loop();
}

/* ─────────────────────────────────────────────────────────────
   TYPED GREETING — the hero's opening line writes itself in, one character at a
   time, each its own element easing in on OPACITY AND TRANSFORM ONLY. Don't add
   a filter or box-shadow here: a blur transition on thirteen elements is a
   raster pass every frame over the grain and atmosphere, and that was the
   stutter. The cadence is uneven on purpose but the beats are short — a 300ms
   hold after the "!" also read as lag. The full text lives in the HTML, so with
   no JS (or under reduced motion) the line is simply there.
   ───────────────────────────────────────────────────────────── */
function initTyping() {
  const el = $("#heroHi");
  if (!el || reduced) return;
  const full = el.textContent;
  const line = el.parentElement;
  el.textContent = "";
  line.classList.add("is-typing");
  let i = 0;
  const delayAfter = (ch) => {
    if (ch === "!" || ch === "." || ch === "?") return 175;
    if (ch === "," || ch === ";") return 120;
    if (ch === " ") return 46;
    return 30 + Math.random() * 30;
  };
  const tick = () => {
    const ch = full[i++];
    const sp = document.createElement("i");
    // a space still needs a box to animate, and NBSP keeps it from collapsing
    sp.textContent = ch === " " ? "\u00a0" : ch;
    el.appendChild(sp);
    // the class lands on the NEXT frame so the transition has a start state
    requestAnimationFrame(() => sp.classList.add("in"));
    if (i < full.length) setTimeout(tick, delayAfter(ch));
    else setTimeout(() => line.classList.remove("is-typing"), 1200);
  };
  setTimeout(tick, 520);        // let the load choreography land first
}

/* ─────────────────────────────────────────────────────────────
   MAGNETIC CTA — the primary button eases toward the pointer within its bounds
   (hover-capable devices only), a subtle premium micro-interaction.
   ───────────────────────────────────────────────────────────── */
function initMagnet() {
  if (!canHover || reduced) return;
  const bind = (sel, k) => $$(sel).forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const mx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const my = (e.clientY - (r.top + r.height / 2)) / r.height;
      el.style.transform = `translate(${(mx * k).toFixed(1)}px,${(my * k * 0.8).toFixed(1)}px)`;
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  });
  bind(".scs__cta", 7);      // primary CTA — a firmer pull
  bind(".nav__links a", 4);  // nav links ease toward the cursor (subtle, cohesive)
}

/* ─────────────────────────────────────────────────────────────
   BOOT
   ───────────────────────────────────────────────────────────── */
/* Every optional element is optional. Deleting the footer once removed #year,
   and the unguarded write here threw on BOOT's FIRST line — which killed every
   init below it and took all six figures down with it. Nothing in BOOT may
   assume an element exists. */
const yr = $("#year");
if (yr) yr.textContent = new Date().getFullYear();
setTheme("ml");

/* natural light follows local time — a whisper of warmth at golden hour, a
   cool cast late at night, neutral through the day (alphas capped ≤ .05 so
   readability and the off-white identity never change) */
{
  const now = new Date(), hr = now.getHours() + now.getMinutes() / 60;
  const g = (c, s) => Math.exp(-((hr - c) ** 2) / (2 * s * s));
  const warm = Math.min(1, g(7, 1.4) + g(18.5, 1.8));
  const cool = Math.min(1, g(22, 2.2) + g(3.5, 2.2));
  document.documentElement.style.setProperty("--warmA", (warm * 0.05).toFixed(3));
  document.documentElement.style.setProperty("--coolA", (cool * 0.04).toFixed(3));
}

/* load choreography — .js-anim lands before first paint (this script sits at
   the end of <body>), .is-loaded one frame later. Scheduled FIRST so an
   exception in any later init can never leave the hero hidden. */
if (!reduced) {
  document.body.classList.add("js-anim");
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.body.classList.add("is-loaded")));
}

/* …and each init is isolated, for the same reason: one section's markup being
   edited or removed must never be able to blank the rest of the page. A thrown
   init is reported and skipped, not fatal. */
const safe = (name, fn) => { try { fn(); } catch (e) { console.error("[init] " + name, e); } };
safe("reveals", initReveals);
safe("scale", initScale);
safe("showcase", initShowcase);
safe("heroViz", initHeroViz);
safe("research", initResearch);
safe("researchViz", initResearchViz);
safe("menu", initMenu);
safe("atmosphere", initAtmosphere);
safe("magnet", initMagnet);
safe("typing", initTyping);
addEventListener("scroll", onScroll, { passive: true });
safe("scroll", onScroll);
/* re-check reveals once layout has actually settled (fonts, canvas boxes) and on
   any resize. Without this, anything measured as below-the-fold during boot —
   which can happen while the page is still laying out — stays hidden until the
   first scroll, and on a short page that scroll may never come. */
addEventListener("load", revealCheck);
addEventListener("resize", revealCheck);
requestAnimationFrame(() => requestAnimationFrame(revealCheck));
initLenis();
