// glass.jsui.js — GLASS Max for Live custom GUI (single-file: draw + mouse + LOM)
// =============================================================================
// Drives the 8 macros of the parent GLASS Audio Effect Rack (Option-A placement:
// this device lives INSIDE the rack as the first chain device; we walk up to the
// parent rack and grab its macro parameters). Drawing via mgraphics, mouse via
// onclick/ondrag, Live control via LiveAPI. See CLAUDE.md / glass-m4l-handoff.md.
//
// BLIND-BUILT — not yet tested in Max. STATUS posts to the Max console; open the
// Max Console (in Max: Window > Max Console) and paste output back for iteration.
// Send the message "bang" to this jsui to re-resolve the rack (e.g. after moving it).
// =============================================================================

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;   // use pixel coords matching the box size
mgraphics.autofill = 0;

// ---- config -----------------------------------------------------------------
// Knobs in MOCKUP DISPLAY ORDER (single row L->R). Each maps to a rack macro INDEX.
// macro index i -> rack parameter (i+1)  (parameter 0 is "Device On"). All knobs show %.
// Logo-matched refraction: the eight hues are sampled straight from the icon's
// shattered-glass burst (icon/glass-icon-1024.png) so the GUI reads as the same object
// as the logo. The burst is RED-dominant with a teal pop, sweeping to magenta/pink — and
// has essentially NO green, so the row skips green too (warm red anchor -> magenta close).
var KNOBS = [
    { label: "REFLECT",  macro: 0, color: [0.93, 0.37, 0.27] }, // logo red-coral (dominant)
    { label: "VERB",     macro: 7, color: [0.95, 0.54, 0.30] }, // logo orange
    { label: "DELAY",    macro: 1, color: [0.99, 0.77, 0.42] }, // logo gold
    { label: "ECHO %",   macro: 2, color: [0.37, 0.83, 0.79] }, // logo teal (the pop)
    { label: "ECHO T",   macro: 3, color: [0.28, 0.72, 0.85] }, // logo cyan
    { label: "WAVY",     macro: 4, color: [0.40, 0.58, 0.92] }, // logo electric blue
    { label: "WOBBLE",   macro: 5, color: [0.64, 0.34, 0.79] }, // logo violet
    { label: "COMP",     macro: 6, color: [0.86, 0.34, 0.62] }  // logo magenta-pink (close)
];

// Preset snapshots, by MACRO INDEX 0..7 (0..127 each).
// MIDNIGHT is read off the mockup; ANGELS/GHOSTS are seed placeholders — Andrew
// can re-capture later (send "capture <name>" to overwrite from the live rack).
// Real macro snapshots recovered from GLASS.adg <MacroVariations> (2026-06-03).
// Index order 0..7 = Reflect, Delay, Echo%, Echo Time, Wavy, Wobble, Comp, Verb.
var PRESETS = [
    { name: "MIDNIGHT", vals: [82, 68, 69, 65, 64, 64, 0, 41] },
    { name: "ANGELS",   vals: [127, 75.1996841, 49.9555016, 52.9290428, 78.8252335, 53.0584679, 43, 97.3002472] },
    { name: "GHOSTS",   vals: [45.9425011, 16.3671646, 80, 66.4476166, 107.789597, 35, 110, 80.5584259] }
];
var activePreset = -1;

// theme
var BG       = [0.045, 0.052, 0.062];
var BG_HEAD  = [0.065, 0.075, 0.090];
var ACCENT   = [0.95, 0.31, 0.25];   // logo red-coral neon (matches the icon wordmark glow)
var LABEL    = [0.55, 0.58, 0.63];
var KNOBFILL = [0.10, 0.11, 0.13];
var TRACK    = [0.20, 0.22, 0.26];
var POINTER  = [0.90, 0.92, 0.95];
// --- shattered-glass header field, themed per preset --------------------------
// Triangular slivers fan from a focal/impact point to adjacent rim points -> a
// fractured-pane look, brighter near impact (overlapping low-alpha fills accumulate).
// Each preset (MIDNIGHT/ANGELS/GHOSTS) gets its OWN fracture geometry + palette, drawn
// as coherent slices of the colourful shattered-glass stompbox (mockups/GlassPedal.jpeg):
// MIDNIGHT = night blues, ANGELS = airy pink/gold, GHOSTS = eerie greens.
// `aMul` scales overall luminosity; `accent` is the preset's identity colour (echoes the
// blue/purple/green mockup cards). Header theme follows the last-applied preset.
var THEMES = [
    {   // 0 MIDNIGHT
        focal: [0.40, 0.48],
        rim: [[0.00,0.50],[0.04,0.06],[0.10,0.80],[0.16,0.22],[0.22,0.95],[0.29,0.12],
              [0.36,0.62],[0.43,0.02],[0.50,0.88],[0.57,0.28],[0.63,0.98],[0.70,0.08],
              [0.77,0.55],[0.83,0.18],[0.89,0.92],[0.95,0.30],[1.00,0.70]],
        tints: [[0.20,0.34,0.62],[0.16,0.42,0.58],[0.28,0.30,0.66],[0.18,0.40,0.72]],
        cracks: [1,4,7,10,13,15], edge: [0.52,0.68,0.95], aMul: 1.0, accent: [0.30,0.55,0.95]
    },
    {   // 1 ANGELS
        focal: [0.55, 0.30],
        rim: [[0.00,0.30],[0.06,0.78],[0.12,0.08],[0.19,0.52],[0.26,0.04],[0.33,0.42],
              [0.40,0.88],[0.47,0.14],[0.54,0.58],[0.61,0.06],[0.68,0.46],[0.75,0.92],
              [0.82,0.20],[0.89,0.64],[0.95,0.10],[0.98,0.55],[1.00,0.34]],
        tints: [[0.86,0.56,0.80],[0.70,0.60,0.95],[0.96,0.80,0.56],[0.82,0.82,0.96]],
        cracks: [2,5,8,11,14,16], edge: [0.99,0.92,0.82], aMul: 1.35, accent: [0.82,0.56,0.96]
    },
    {   // 2 GHOSTS
        focal: [0.62, 0.55],
        rim: [[0.00,0.65],[0.05,0.15],[0.11,0.92],[0.17,0.35],[0.24,0.05],[0.31,0.70],
              [0.38,0.18],[0.45,0.95],[0.52,0.30],[0.59,0.02],[0.66,0.60],[0.73,0.12],
              [0.80,0.88],[0.87,0.25],[0.93,0.98],[0.97,0.40],[1.00,0.72]],
        tints: [[0.30,0.62,0.45],[0.22,0.58,0.56],[0.42,0.72,0.50],[0.25,0.66,0.62]],
        cracks: [0,3,6,9,12,15], edge: [0.60,0.96,0.78], aMul: 1.1, accent: [0.40,0.86,0.60]
    }
];
// per-sliver base alphas (cycled); scaled by the theme's aMul
var SHARD_A = [0.06,0.10,0.05,0.08,0.05,0.11,0.04,0.07,0.09,0.05,0.10,0.06,0.05,0.08,0.05,0.09];
var themeIdx = 0;   // header theme = last-applied preset (persists through manual edits)
var shatterTheme = null;      // a freshly-generated palette+geometry, used while in shatter mode
var themeIsShatter = false;   // true => header uses shatterTheme instead of THEMES[themeIdx]

// SHATTER button outline — an angular glass-shard polygon (normalised 0..1 in its rect)
var SHATTER_SHARD = [
    [0.03,0.30],[0.24,0.05],[0.50,0.16],[0.77,0.03],[0.98,0.32],
    [0.89,0.58],[1.00,0.85],[0.68,0.98],[0.39,0.90],[0.13,1.00],[0.00,0.64]
];

// arc geometry (cairo: angle clockwise from +x; y is down)
var A0 = Math.PI * 0.75;          // start (lower-left)
var SWEEP = Math.PI * 1.5;        // 270 degrees

// ---- LOM state --------------------------------------------------------------
var rackPath = "";
var params = [];        // params[macroIndex] = LiveAPI on that macro parameter
var pmin = [], pmax = [];
var vals = [];          // current macro values 0..127 (cache for drawing)
var ready = false;

for (var i = 0; i < 8; i++) { vals[i] = 63.5; pmin[i] = 0; pmax[i] = 127; }

// ---- value-reactive draw helpers --------------------------------------------
var hoverKnob = -1;     // knob under the cursor -> drives the shimmer (set by onidle)
var hoverPreset = -1;   // preset button under the cursor -> hover highlight (set by onidle)
var hoverShatter = false; // cursor over the SHATTER button (set by onidle)
var titleRight = 0;       // right edge of the wordmark (measured in paint) for SHATTER placement
var animPhase = 0;      // shimmer phase, advanced by animTask while a knob is hovered

function lerp(a, b, t) { return a + (b - a) * t; }
// "heat": push a hue toward white as its value rises -> lit glass at the top of travel
function heat(c, frac) {
    var t = 0.42 * frac;
    return [lerp(c[0], 1, t), lerp(c[1], 1, t), lerp(c[2], 1, t)];
}
function knobFrac(macro) {
    var f = (vals[macro] - pmin[macro]) / (pmax[macro] - pmin[macro]);
    if (isNaN(f)) f = 0; if (f < 0) f = 0; if (f > 1) f = 1;
    return f;
}
// overall rack "energy" = mean knob fraction; drives how lit the header glass is
function rackEnergy() {
    var s = 0;
    for (var m = 0; m < 8; m++) s += knobFrac(m);
    return s / 8;
}

// per-preset tint: the signature accent, pulled toward the active preset's theme accent
// (MIDNIGHT blue / ANGELS pink / GHOSTS green) so recalling a preset recolours the face.
function accentColor() {
    if (activePreset >= 0 && THEMES[activePreset]) {
        var a = THEMES[activePreset].accent;
        return [lerp(ACCENT[0], a[0], 0.7), lerp(ACCENT[1], a[1], 0.7), lerp(ACCENT[2], a[2], 0.7)];
    }
    return [ACCENT[0], ACCENT[1], ACCENT[2]];
}

// HSV -> RGB (h,s,v all 0..1). Used to randomise SHATTER palettes within a vivid,
// glassy band so they never come out muddy.
function hsv2rgb(h, s, v) {
    var i = Math.floor(h * 6), f = h * 6 - i;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p];
        case 1: return [q, v, p];
        case 2: return [p, v, t];
        case 3: return [p, q, v];
        case 4: return [t, p, v];
        default: return [v, p, q];
    }
}

// Build a brand-new shatter theme: fresh fracture geometry + a fresh palette every call.
// Hues spread around a random base; saturation/value kept high so the glass stays vivid.
function makeShatterTheme() {
    var baseH = Math.random();
    var tints = [];
    for (var i = 0; i < 4; i++) {
        var h = (baseH + (Math.random() - 0.5) * 0.45 + 1) % 1;     // hues near the base
        tints.push(hsv2rgb(h, 0.55 + Math.random() * 0.30, 0.55 + Math.random() * 0.35));
    }
    var rim = [], n = 16;                                            // random fracture rim
    for (var k = 0; k <= n; k++) rim.push([k / n + (Math.random() - 0.5) * 0.03, Math.random()]);
    rim[0][0] = 0; rim[n][0] = 1;
    var cracks = [];
    for (var c = 0; c < 6; c++) cracks.push(Math.floor(Math.random() * rim.length));
    return {
        focal: [0.20 + Math.random() * 0.6, 0.20 + Math.random() * 0.6],
        rim: rim, tints: tints, cracks: cracks,
        edge: hsv2rgb((baseH + 0.5) % 1, 0.30, 0.97),                // bright complementary edge
        aMul: 1.0 + Math.random() * 0.5,
        accent: hsv2rgb(baseH, 0.70, 0.96)
    };
}


// Real-unit knob displays were abandoned — every knob shows %. The macro display_value
// returns raw floats for the beat-sync/dB macros and only spammed the Max console with
// "jsliveapi • Invalid display value", so we never read it. (Removed the readDisp stub +
// disp[] cache in the cleanup pass; reinstate a formatter here if unit display ever returns.)

function post_(s) { post("[GLASS] " + s + "\n"); }

// Unsubscribe + drop existing macro observers before rebinding. Without this, every
// re-resolve (bang) and every autowatch reload leaves the old observers alive; a stale
// one firing into a torn-down JS context is the source of the "SendMessage … error 2".
function freeObservers() {
    for (var m = 0; m < params.length; m++) {
        if (params[m]) {
            try { params[m].property = ""; } catch (e) {}  // stop observing
            params[m] = null;
        }
    }
    params = [];
}

// resolve parent rack + macro params. On load the device often isn't settled into the
// chain yet, so `this_device` resolves to an empty path and every macro lookup misses.
// Rather than barf a 10-line error block on every load before the real bind lands, we
// retry quietly a handful of times and only complain once we've genuinely given up. A
// single clean "OK rack=… macros bound=8" is the success signal.
var initAttempts = 0;
var INIT_MAX_RETRIES = 10;          // ~2s of 200ms retries before we give up + warn
var retryTask = new Task(initLOM);
var lastOK = "";                    // last reported bind signature; suppresses duplicate
                                    // "OK" lines when bootTask + autowatch reload both fire

function initLOM() {
    try {
        ready = false;
        freeObservers();
        var dev = new LiveAPI(null, "this_device");
        var p = dev.path;                       // e.g. live_set tracks 0 devices 1 chains 0 devices 0
        if (p && p.charAt(0) === '"') p = p.replace(/(^")|("$)/g, ""); // strip quotes if present
        // parent rack = strip the trailing " chains N devices M"
        rackPath = p.replace(/\s+chains\s+\d+\s+devices\s+\d+\s*$/, "");
        if (!p || rackPath === p) {             // not in a rack yet (or not at all) — retry, then warn
            if (initAttempts++ < INIT_MAX_RETRIES) { retryTask.schedule(200); return; }
            post_("WARNING: device path has no parent rack — is it inside the GLASS rack? path=" + p);
            return;
        }
        var rack = new LiveAPI(null, rackPath);
        var plist = rack.get("parameters");     // ["id", 1, "id", 2, ...]
        if (!plist || plist.length < 4) {
            if (initAttempts++ < INIT_MAX_RETRIES) { retryTask.schedule(200); return; }
            post_("ERROR: rack has no parameters at " + rackPath); return;
        }
        params = [];
        var bound = 0;
        for (var m = 0; m < 8; m++) {
            // parameter index for macro m is (m+1); id sits at odd positions
            var pid = plist[(m + 1) * 2 + 1];
            if (pid === undefined) continue;    // not present yet — handled by the retry below
            var ap = new LiveAPI((function (slot) {
                return function (args) { onMacroChanged(slot, args); };
            })(m), "id " + pid);
            ap.property = "value";              // observe external/automation changes
            pmin[m] = parseFloat(ap.get("min"));
            pmax[m] = parseFloat(ap.get("max"));
            if (isNaN(pmin[m])) pmin[m] = 0;
            if (isNaN(pmax[m])) pmax[m] = 127;
            vals[m] = parseFloat(ap.get("value"));
            params[m] = ap;
            bound++;
        }
        if (bound < 8 && initAttempts++ < INIT_MAX_RETRIES) { retryTask.schedule(200); return; }
        initAttempts = 0;
        ready = true;
        var sig = rackPath + " bound=" + bound;     // only announce a *changed* bind
        if (sig !== lastOK) { post_("OK [build v4 red-neon] rack=" + rackPath + "  macros bound=" + bound); lastOK = sig; }
        mgraphics.redraw();
    } catch (e) {
        post_("EXC initLOM: " + e.message);
    }
}

function onMacroChanged(slot, args) {
    if (!ready) return;   // ignore the immediate bind-time callback and any teardown-race callback
    var v = (args && args.length >= 2 && args[0] === "value") ? args[1] : args[args ? args.length - 1 : 0];
    if (v === undefined || isNaN(v)) return;
    vals[slot] = parseFloat(v);
    // NB: do NOT clear activePreset here — these callbacks fire async after applyPreset()
    // writes the macros, and would wipe the highlight. The highlight is cleared only by a
    // user knob-drag (see ondrag).
    mgraphics.redraw();
}

function setMacro(slot, v) {
    if (v < pmin[slot]) v = pmin[slot];
    if (v > pmax[slot]) v = pmax[slot];
    vals[slot] = v;
    if (ready && params[slot]) {
        try { params[slot].set("value", v); }
        catch (e) { post_("EXC set " + slot + ": " + e.message); }
    }
    mgraphics.redraw();
}

function applyPreset(idx) {
    if (idx < 0 || idx >= PRESETS.length) return;
    var pv = PRESETS[idx].vals;
    for (var m = 0; m < 8; m++) setMacro(m, pv[m]);
    activePreset = idx;
    themeIdx = idx;     // re-shatter + recolour the header to this preset's theme
    themeIsShatter = false;   // back to the preset's palette
    mgraphics.redraw();
}

// SHATTER: randomise all 8 macros, drop any active preset, and re-shatter the header
// with a freshly-generated palette + fracture geometry (unique every time).
function doShatter() {
    for (var m = 0; m < 8; m++) {
        setMacro(m, pmin[m] + Math.random() * (pmax[m] - pmin[m]));
    }
    activePreset = -1;
    shatterTheme = makeShatterTheme();
    themeIsShatter = true;
    mgraphics.redraw();
}

// messages from Max -----------------------------------------------------------
function bang() { initAttempts = 0; lastOK = ""; initLOM(); }   // re-resolve (fresh retries + always reports)
function preset(i) { applyPreset(i); }         // "preset 0/1/2"
function shatter() { doShatter(); }            // randomise all knobs
function capture(name) {                        // "capture GHOSTS" -> overwrite a preset from live values
    for (var k = 0; k < PRESETS.length; k++) {
        if (PRESETS[k].name === String(name).toUpperCase()) {
            for (var m = 0; m < 8; m++) PRESETS[k].vals[m] = vals[m];
            post_("captured " + PRESETS[k].name + " = [" + PRESETS[k].vals.map(function (x) { return Math.round(x); }).join(",") + "]");
            return;
        }
    }
    post_("capture: no preset named " + name);
}

// ---- layout helpers ---------------------------------------------------------
function W() { return box.rect[2] - box.rect[0]; }
function H() { return box.rect[3] - box.rect[1]; }
function headerH() { return H() * 0.30; }

function presetRects() {
    var w = W(), hh = headerH();
    var bw = Math.min(w * 0.13, 110), bh = hh * 0.52, gap = bw * 0.12;
    var total = bw * 3 + gap * 2;
    var x0 = w - total - w * 0.02;
    var y = (hh - bh) / 2;
    var r = [];
    for (var i = 0; i < 3; i++) r.push([x0 + i * (bw + gap), y, bw, bh]);
    return r;
}

// the SHATTER action button: centred in the gap between the wordmark's right edge and
// the left edge of the first preset (equidistant from both).
function shatterRect() {
    var w = W(), hh = headerH();
    var bw = Math.min(w * 0.13, 110), bh = hh * 0.52, gap = bw * 0.12;
    var total = bw * 3 + gap * 2;
    var x0 = w - total - w * 0.02;                       // left edge of first preset
    var leftBound = (titleRight > 0 ? titleRight : w * 0.30) + gap;   // wordmark right + breathing room
    var mid = (leftBound + x0) / 2;                      // midpoint of the gap
    var y = (hh - bh) / 2;
    return [mid - bw / 2, y, bw, bh];
}

function knobGeom(i) {
    var w = W(), top = headerH(), areaH = H() - top;
    var cellW = w / 8;
    var cx = (i + 0.5) * cellW;
    var cy = top + areaH * 0.46;
    var r = Math.min(cellW * 0.30, areaH * 0.32);
    return { cx: cx, cy: cy, r: r };
}

// ---- paint ------------------------------------------------------------------
function paint() {
    var w = W(), h = H(), hh = headerH();

    // background
    mgraphics.set_source_rgba(BG[0], BG[1], BG[2], 1);
    mgraphics.rectangle(0, 0, w, h); mgraphics.fill();

    // header band + shattered-glass field
    mgraphics.set_source_rgba(BG_HEAD[0], BG_HEAD[1], BG_HEAD[2], 1);
    mgraphics.rectangle(0, 0, w, hh); mgraphics.fill();
    drawShards(w, hh);

    // wordmark — RED NEON TUBE, matching the logo: hollow outlined letters (text_path +
    // stroke) with a soft glow, over faint chromatic-split ghosts (glass refraction). The
    // split widens + the tube heats toward white as rack energy rises (glass under stress);
    // the tube takes the per-preset tint.
    mgraphics.select_font_face("JetBrains Mono", "normal");
    mgraphics.set_font_size(Math.max(13, hh * 0.42));
    var WORD = "G L A S S";
    var we = rackEnergy(), wx = w * 0.025, wy = hh * 0.66;
    titleRight = wx + mgraphics.text_measure(WORD)[0];    // cache for SHATTER placement
    var split = 1.0 + 4.0 * we, gha = 0.22 + 0.26 * we;   // ghost offset + alpha
    var ac = accentColor();
    // cool refracted ghost (left)
    mgraphics.set_source_rgba(0.30, 0.70, 0.98, gha);
    mgraphics.move_to(wx - split, wy); mgraphics.show_text(WORD);
    // warm refracted ghost (right)
    mgraphics.set_source_rgba(0.96, 0.28, 0.52, gha);
    mgraphics.move_to(wx + split, wy); mgraphics.show_text(WORD);
    // neon tube core (per-preset tint), heating toward white with energy: a soft wide glow
    // stroke, then a bright thin tube on top. Outlined glyphs = hollow letters like the logo.
    var ct = 0.30 * we;
    var cr = lerp(ac[0], 1, ct), cg = lerp(ac[1], 1, ct), cb = lerp(ac[2], 1, ct);
    mgraphics.move_to(wx, wy); mgraphics.text_path(WORD);
    mgraphics.set_source_rgba(cr, cg, cb, 0.30 + 0.22 * we);   // outer glow halo
    mgraphics.set_line_width(Math.max(3, hh * 0.10));
    mgraphics.stroke_preserve();
    mgraphics.set_source_rgba(cr, cg, cb, 1);                  // bright thin tube
    mgraphics.set_line_width(Math.max(1, hh * 0.028));
    mgraphics.stroke();

    // preset buttons
    var pr = presetRects();
    mgraphics.set_font_size(Math.max(8, hh * 0.22));
    for (var p = 0; p < pr.length; p++) {
        var R = pr[p], on = (p === activePreset), hov = (p === hoverPreset);
        var pac = THEMES[p].accent;   // this preset's identity colour (blue/pink/green)
        // fill: rest = dark/cool, hover = neutral lift (clickable), active = lit in its hue
        if (on)       mgraphics.set_source_rgba(pac[0] * 0.22, pac[1] * 0.22, pac[2] * 0.22, 1);
        else if (hov) mgraphics.set_source_rgba(0.15, 0.16, 0.18, 1);
        else          mgraphics.set_source_rgba(0.10, 0.11, 0.13, 1);
        roundRect(R[0], R[1], R[2], R[3], 4); mgraphics.fill();
        // border: preset hue when active, cool-bright on hover, dim grey at rest
        mgraphics.set_line_width(on ? 1.7 : (hov ? 1.3 : 1));
        if (on)       mgraphics.set_source_rgba(pac[0], pac[1], pac[2], 1);
        else if (hov) mgraphics.set_source_rgba(0.45, 0.78, 0.85, 0.95);
        else          mgraphics.set_source_rgba(0.30, 0.32, 0.36, 1);
        roundRect(R[0], R[1], R[2], R[3], 4); mgraphics.stroke();
        // centered label (nudged up to leave room for the theme accent)
        if (on)       mgraphics.set_source_rgba(lerp(pac[0], 1, 0.25), lerp(pac[1], 1, 0.25), lerp(pac[2], 1, 0.25), 1);
        else if (hov) mgraphics.set_source_rgba(0.82, 0.84, 0.88, 1);
        else          mgraphics.set_source_rgba(LABEL[0], LABEL[1], LABEL[2], 1);
        centerText(PRESETS[p].name, R[0] + R[2] / 2, R[1] + R[3] * 0.46);

        // theme identity accent — a small underline per card
        mgraphics.set_source_rgba(pac[0], pac[1], pac[2], on ? 1.0 : 0.7);
        mgraphics.set_line_width(2);
        mgraphics.move_to(R[0] + R[2] * 0.30, R[1] + R[3] - 4);
        mgraphics.line_to(R[0] + R[2] * 0.70, R[1] + R[3] - 4);
        mgraphics.stroke();
    }

    // SHATTER action button — a FROSTED GLASS SHARD: a translucent pale shard that
    // catches light, with a bright refracted rim, faint internal cracks, and a white
    // label. Cool and glassy; no solid fill, no black text. Frost brightens on hover.
    var SR = shatterRect(), sh = hoverShatter;
    // vertical inset: map the shard's 0..1 points into a tucked band (INY0..INY0+INYS) so
    // its points don't poke above/below the preset pills — keeps the row visually aligned.
    var sx0 = SR[0], sw = SR[2], sy0 = SR[1], shh = SR[3], INY0 = 0.09, INYS = 0.82;
    mgraphics.move_to(sx0 + SHATTER_SHARD[0][0] * sw, sy0 + (INY0 + SHATTER_SHARD[0][1] * INYS) * shh);
    for (var si = 1; si < SHATTER_SHARD.length; si++)
        mgraphics.line_to(sx0 + SHATTER_SHARD[si][0] * sw, sy0 + (INY0 + SHATTER_SHARD[si][1] * INYS) * shh);
    mgraphics.close_path();
    // dark backing first (near-black, fully opaque) so the label stays legible over any
    // random shard palette behind it
    mgraphics.set_source_rgba(0.03, 0.04, 0.055, 1.0);
    mgraphics.fill_preserve();
    // faint frosted sheen on top of the backing (kept on the path so we can rim it) —
    // kept low so the shard stays dark; the glass read comes from the rim + cracks
    mgraphics.set_source_rgba(0.72, 0.83, 0.96, sh ? 0.20 : 0.11);
    mgraphics.fill_preserve();
    // bright refracted rim
    mgraphics.set_source_rgba(0.80, 0.90, 1.0, sh ? 0.92 : 0.55);
    mgraphics.set_line_width(sh ? 1.6 : 1.1);
    mgraphics.stroke();
    // faint internal cracks for the broken-glass read
    mgraphics.set_source_rgba(0.85, 0.92, 1.0, sh ? 0.5 : 0.30);
    mgraphics.set_line_width(0.75);
    mgraphics.move_to(sx0 + 0.30 * sw, sy0 + (INY0 + 0.06 * INYS) * shh);
    mgraphics.line_to(sx0 + 0.46 * sw, sy0 + (INY0 + 0.96 * INYS) * shh);
    mgraphics.move_to(sx0 + 0.62 * sw, sy0 + (INY0 + 0.12 * INYS) * shh);
    mgraphics.line_to(sx0 + 0.50 * sw, sy0 + (INY0 + 0.55 * INYS) * shh);
    mgraphics.stroke();
    // white label (slight cool tint)
    mgraphics.set_source_rgba(0.92, 0.96, 1.0, 1);
    centerText("SHATTER", SR[0] + SR[2] / 2, SR[1] + SR[3] * 0.62);

    // knobs
    for (var i = 0; i < KNOBS.length; i++) {
        var g = knobGeom(i), k = KNOBS[i];
        var v = vals[k.macro], frac = (v - pmin[k.macro]) / (pmax[k.macro] - pmin[k.macro]);
        if (isNaN(frac)) frac = 0; if (frac < 0) frac = 0; if (frac > 1) frac = 1;

        // label
        mgraphics.select_font_face("JetBrains Mono", "normal");
        mgraphics.set_font_size(Math.max(8, g.r * 0.42));
        mgraphics.set_source_rgba(LABEL[0], LABEL[1], LABEL[2], 1);
        centerText(k.label, g.cx, g.cy - g.r - g.r * 0.30);

        // track arc
        mgraphics.set_line_width(Math.max(2, g.r * 0.16));
        mgraphics.set_source_rgba(TRACK[0], TRACK[1], TRACK[2], 1);
        mgraphics.arc(g.cx, g.cy, g.r, A0, A0 + SWEEP); mgraphics.stroke();

        // heated hue: arc core lerps toward white as the value climbs (lit glass)
        var hc = heat(k.color, frac);

        // value arc: a soft outer bloom + a glow underlay, BOTH charging (alpha + width)
        // with the value, then the hot heated core line on top.
        mgraphics.set_source_rgba(k.color[0], k.color[1], k.color[2], 0.05 + 0.16 * frac);
        mgraphics.set_line_width(Math.max(6, g.r * 0.34) * (1.25 + 0.75 * frac));
        mgraphics.arc(g.cx, g.cy, g.r, A0, A0 + SWEEP * frac); mgraphics.stroke();
        mgraphics.set_source_rgba(k.color[0], k.color[1], k.color[2], 0.12 + 0.40 * frac);
        mgraphics.set_line_width(Math.max(5, g.r * 0.34));
        mgraphics.arc(g.cx, g.cy, g.r, A0, A0 + SWEEP * frac); mgraphics.stroke();
        mgraphics.set_source_rgba(hc[0], hc[1], hc[2], 1);
        mgraphics.set_line_width(Math.max(2, g.r * 0.16));
        mgraphics.arc(g.cx, g.cy, g.r, A0, A0 + SWEEP * frac); mgraphics.stroke();

        // shimmer: a soft pulse breathing along ONLY the filled (value) portion of the arc
        if (i === hoverKnob && frac > 0.001) {
            var pulse = 0.5 + 0.5 * Math.sin(animPhase);
            mgraphics.set_source_rgba(hc[0], hc[1], hc[2], 0.16 + 0.40 * pulse);
            mgraphics.set_line_width(Math.max(3, g.r * (0.20 + 0.14 * pulse)));
            mgraphics.arc(g.cx, g.cy, g.r, A0, A0 + SWEEP * frac); mgraphics.stroke();
        }

        // body (fill brightens slightly with value)
        var bb = 1 + 0.6 * frac;
        mgraphics.set_source_rgba(KNOBFILL[0] * bb, KNOBFILL[1] * bb, KNOBFILL[2] * bb, 1);
        mgraphics.arc(g.cx, g.cy, g.r * 0.66, 0, Math.PI * 2); mgraphics.fill();

        // pointer (tints toward the heated hue at the top of travel so it glows)
        var ang = A0 + SWEEP * frac, pt = 0.45 * frac;
        mgraphics.set_line_width(Math.max(2, g.r * 0.12));
        mgraphics.set_source_rgba(lerp(POINTER[0], hc[0], pt), lerp(POINTER[1], hc[1], pt), lerp(POINTER[2], hc[2], pt), 1);
        mgraphics.move_to(g.cx + Math.cos(ang) * g.r * 0.24, g.cy + Math.sin(ang) * g.r * 0.24);
        mgraphics.line_to(g.cx + Math.cos(ang) * g.r * 0.60, g.cy + Math.sin(ang) * g.r * 0.60);
        mgraphics.stroke();

        // value text — coloured to match the knob's own arc (ties each number to its dial)
        var vtxt = Math.round(frac * 100) + "%";
        mgraphics.set_source_rgba(k.color[0], k.color[1], k.color[2], 1);
        mgraphics.set_font_size(Math.max(8, g.r * 0.40));
        centerText(vtxt, g.cx, g.cy + g.r + g.r * 0.55);
    }

    if (!ready) {
        mgraphics.set_source_rgba(0.40, 0.72, 0.78, 0.85);
        mgraphics.select_font_face("JetBrains Mono", "normal");
        mgraphics.set_font_size(10);
        mgraphics.move_to(w * 0.025, h - 6);
        mgraphics.show_text("connecting to GLASS rack…  (send 'bang' to retry)");
    }
}

function roundRect(x, y, w, h, r) {
    mgraphics.move_to(x + r, y);
    mgraphics.line_to(x + w - r, y); mgraphics.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    mgraphics.line_to(x + w, y + h - r); mgraphics.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    mgraphics.line_to(x + r, y + h); mgraphics.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    mgraphics.line_to(x, y + r); mgraphics.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

function centerText(str, cx, baseline) {
    var m = mgraphics.text_measure(str);   // [w, h]
    mgraphics.move_to(cx - m[0] / 2, baseline);
    mgraphics.show_text(str);
}

function drawShards(w, hh) {
    var th = (themeIsShatter && shatterTheme) ? shatterTheme : (THEMES[themeIdx] || THEMES[0]);
    var rim = th.rim, tints = th.tints, edge = th.edge, aMul = th.aMul;
    var fx = th.focal[0] * w, fy = th.focal[1] * hh;

    // Reactive header: the glass lights up HARD as the rack is pushed. `energy` (mean
    // knob fraction) is eased so the burn ramps in aggressively, then scales sliver/edge
    // luminance, crack brightness + reach + width, and the impact glint.
    var energy = rackEnergy();
    var eb = Math.pow(energy, 0.65);     // ease: low-mid energy already reads bright
    var eMul = 0.45 + 1.85 * eb;         // 0.45 (idle) .. 2.30 (everything maxed)

    // translucent triangular slivers (focal -> adjacent rim pair), tints cycling
    for (var i = 0; i < rim.length - 1; i++) {
        var a = rim[i], b = rim[i + 1];
        var t = tints[i % tints.length];
        mgraphics.set_source_rgba(t[0], t[1], t[2], SHARD_A[i % SHARD_A.length] * aMul * eMul);
        mgraphics.move_to(fx, fy);
        mgraphics.line_to(a[0] * w, a[1] * hh);
        mgraphics.line_to(b[0] * w, b[1] * hh);
        mgraphics.close_path();
        mgraphics.fill();
        // bright refracted edge along the outer chord (brightens + thickens with energy)
        mgraphics.set_source_rgba(t[0] + 0.22 + 0.2 * eb, t[1] + 0.22 + 0.2 * eb, t[2] + 0.22 + 0.2 * eb, (0.20 + 0.30 * eb) * aMul);
        mgraphics.set_line_width(0.75 + 1.25 * eb);
        mgraphics.move_to(a[0] * w, a[1] * hh);
        mgraphics.line_to(b[0] * w, b[1] * hh);
        mgraphics.stroke();
    }

    // short crack-lines radiating from the focal point — they run only PART of the way
    // toward each rim point (so they read as cracks near the impact, not lasers across the
    // whole header). They lengthen + brighten with energy but never streak full-width.
    var run = 0.40 + 0.32 * eb;     // 0.40 (idle) .. 0.72 (maxed) of the way to the rim
    for (var c = 0; c < th.cracks.length; c++) {
        var p = rim[th.cracks[c]];
        if (!p) continue;
        var ex = fx + (p[0] * w - fx) * run, ey = fy + (p[1] * hh - fy) * run;
        mgraphics.set_source_rgba(edge[0], edge[1], edge[2], 0.10 + 0.78 * eb);
        mgraphics.set_line_width(((c % 2) ? 0.75 : 1.4) * (1 + 1.1 * eb));
        mgraphics.move_to(fx, fy);
        mgraphics.line_to(ex, ey);
        mgraphics.stroke();
    }

    // hot glint right at the impact point (swells + flares with energy)
    mgraphics.set_source_rgba(edge[0] + 0.25, edge[1] + 0.20, edge[2] + 0.10, 0.30 + 0.65 * eb);
    mgraphics.arc(fx, fy, Math.max(1.2, hh * 0.012) * (1 + 2.0 * eb), 0, Math.PI * 2);
    mgraphics.fill();
}

// ---- mouse ------------------------------------------------------------------
var drag = { knob: -1, lastY: 0 };

// knob index under a point (within a forgiving radius), or -1
function knobAt(x, y) {
    for (var i = 0; i < KNOBS.length; i++) {
        var g = knobGeom(i), dx = x - g.cx, dy = y - g.cy;
        if (Math.sqrt(dx * dx + dy * dy) <= g.r * 1.4) return i;
    }
    return -1;
}

// preset-button index under a point, or -1
function presetAt(x, y) {
    var pr = presetRects();
    for (var p = 0; p < pr.length; p++) {
        var R = pr[p];
        if (x >= R[0] && x <= R[0] + R[2] && y >= R[1] && y <= R[1] + R[3]) return p;
    }
    return -1;
}

// is a point over the SHATTER button?
function shatterAt(x, y) {
    var R = shatterRect();
    return (x >= R[0] && x <= R[0] + R[2] && y >= R[1] && y <= R[1] + R[3]);
}

function onclick(x, y) {
    // SHATTER button? (clear any pending knob-drag so a stray ondrag can't fight it)
    if (shatterAt(x, y)) { drag.knob = -1; doShatter(); return; }
    // preset buttons? clear any pending knob-drag so a stray ondrag can't deselect it
    var hp = presetAt(x, y);
    if (hp >= 0) { drag.knob = -1; applyPreset(hp); return; }
    // knobs?
    var hit = knobAt(x, y);
    if (hit >= 0) {
        drag.knob = hit; drag.lastY = y;
        hoverKnob = hit; startAnim();   // shimmer the grabbed knob during the drag
        return;
    }
    drag.knob = -1;
}
onclick.local = 1;

function ondrag(x, y) {
    if (drag.knob < 0) return;
    activePreset = -1;          // a manual knob move means we're no longer on a preset
    var k = KNOBS[drag.knob], range = pmax[k.macro] - pmin[k.macro];
    var dv = (drag.lastY - y) / 150 * range;   // 150px = full travel; up = increase
    drag.lastY = y;
    setMacro(k.macro, vals[k.macro] + dv);
}
ondrag.local = 1;

function ondblclick(x, y) {
    var hit = knobAt(x, y);
    if (hit >= 0) {
        var k = KNOBS[hit];
        setMacro(k.macro, (pmin[k.macro] + pmax[k.macro]) / 2);  // reset to center
    }
}
ondblclick.local = 1;

// hover: track the knob + preset under the cursor; shimmer runs only while a knob is hovered
function onidle(x, y) {
    var hk = knobAt(x, y), hp = presetAt(x, y), hsh = shatterAt(x, y);
    if (hk !== hoverKnob || hp !== hoverPreset || hsh !== hoverShatter) {
        hoverKnob = hk; hoverPreset = hp; hoverShatter = hsh; mgraphics.redraw();
    }
    if (hoverKnob >= 0) startAnim(); else stopAnim();
}
onidle.local = 1;

function onidleout(x, y) {
    hoverKnob = -1;
    hoverPreset = -1;
    hoverShatter = false;
    stopAnim();
    mgraphics.redraw();
}
onidleout.local = 1;

// ---- shimmer animation (only ticks while a knob is hovered/dragged) ----------
var animTask = new Task(function () {
    animPhase += 0.06;     // slow, smooth breath (~3.5s per glow/fade cycle at 30fps)
    if (animPhase > 6283) animPhase = 0;   // keep it bounded (~1000*2pi)
    mgraphics.redraw();
});
animTask.interval = 33;   // ~30 fps
function startAnim() { if (!animTask.running) animTask.repeat(); }
function stopAnim()  { if (animTask.running) animTask.cancel(); }

// ---- lifecycle --------------------------------------------------------------
function onresize() { mgraphics.redraw(); }
onresize.local = 1;

// LOM may not be ready at script load; resolve shortly after.
var bootTask = new Task(initLOM);
bootTask.schedule(300);
