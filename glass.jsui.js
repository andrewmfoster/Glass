// glass.jsui.js — GLASS Max for Live custom GUI (single-file: draw + mouse + LOM)
// =============================================================================
// Drives the 8 macros of the parent GLASS Audio Effect Rack (Option-A placement:
// this device lives INSIDE the rack as the first chain device; we walk up to the
// parent rack and grab its macro parameters). Drawing via mgraphics, mouse via
// onclick/ondrag, Live control via LiveAPI. See CLAUDE.md / glass-m4l-handoff.md.
//
// FACE: "Blackout", ported 2026-10-10 from mockups/glass-face-blackout.html (Flat cap,
// Neon SHATTER button, colour on the cap's top edge). The mock is the reference; where the
// two disagree the mock is right. The Live half (LOM state through the message functions)
// is the shipped v4 code, untouched apart from the build tag and the plate calls.
//
// PRESETS: version A of mockups/glass-presets-mock.html, ported 2026-10-10. One bank (the
// three stock presets, then the user's own) sits behind all three face slots; the caret at
// the end of a slot's colour line opens it. The user's presets and the slots live in one
// file on disk, shared by every Live set. Names are typed in a Max text box laid over the slot.
//
// BACK, HOLD, GLIDE: ported 2026-10-10 from mockups/glass-controls-mock.html in the versions
// Andrew picked: the back arrow left of SHATTER, the glide word right of it, and a click on a
// knob's label to hold it. Also the messages "back", "hold <knob> [0/1]" and "glide [0..6]".
// Andrew's rulings the same night (v5.11): the arrow and the glide text sit the same distance
// off SHATTER, the arrow is a U-turn, and glide has seven lengths picked from a list.
// Then neon for both marks (v5.12), the pill's recipe: unlit glass until there is something
// to show, the sign's red glow when lit, more under the pointer. The glows are baked.
//
// MIX: a ninth knob on the rack's ninth macro, set apart at the end of the row behind a
// hairline (Andrew's pick, 10-10). It belongs to no preset: SHATTER, presets and BACK never
// move it. What the macro does is the rack's business (a dry path, built in Live).
//
// PAD: the rack's tenth macro fires SHATTER (v5.13), so a key, a pad, a knob or automation can
// be mapped to it in Live like any other control. It has no knob on the face.
//
// KEPT WITH THE SET: the held knobs and the glide length live in the rack's eleventh, twelfth
// and thirteenth macros (v5.15), so a saved set brings them back. Andrew, 10-10: losing them
// on a reload is not acceptable.
//
// PULSE: the face moves with the audio leaving the rack (v5.17, Andrew 10-11, tuned on
// mockups/glass-pulse-mock.html): the sign's glow, the plate and all eight knobs' shards lift
// together on each hit and fall back, scaled by MIX. An LED left of the back arrow, in SHATTER's
// neon, turns it off; that choice is kept in the rack's fourteenth macro. The level comes from a
// peakamp~ the script patches onto plugin~ at load, as "level <peak>" every 33 ms.
//
// ENGINE: the legacy jsui, ES5 only. No arrow functions, let, const, template strings,
// Math.imul. Every drawing call here is one glass-test.jsui.js ran in Live 12's Max 9.1.5
// (10-10), except set_line_cap and gradient fills on a rectangle and a polygon; each paint
// section is guarded, so a call that fails posts one [GLASS] line and the rest still draws.
//
// Send the message "bang" to this jsui to re-resolve the rack (e.g. after moving it).
// =============================================================================

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;   // use pixel coords matching the box size
mgraphics.autofill = 0;

// ---- config -----------------------------------------------------------------
var BUILD = "v5.18 audit";
// Label and percent face. mgraphics has no letter-spacing, so text is drawn a character at
// a time (see spaced()). The mock is Avenir Next 600; the weight argument is unproven in Max.
var FONT = "Avenir Next", FONT_WEIGHT = "bold";

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
var MIX = 8;                                                  // MIX's macro index, and its knob number on the face
var MIXK = { label: "MIX", macro: MIX, color: [0.910, 0.925, 0.961] };   // white: no hue, no burst
function knobOf(i) { return i === MIX ? MIXK : KNOBS[i]; }

function pal255(a) {
    var out = [];
    for (var i = 0; i < a.length; i++) out.push([a[i][0] / 255, a[i][1] / 255, a[i][2] / 255]);
    return out;
}

// Preset snapshots, by MACRO INDEX 0..7 (0..127 each).
// Real macro snapshots recovered from GLASS.adg <MacroVariations> (2026-06-03); Andrew
// can re-capture later (send "capture <name>" to overwrite from the live rack).
// Index order 0..7 = Reflect, Delay, Echo%, Echo Time, Wavy, Wobble, Comp, Verb.
// accent = the line under the name; pal + seed = the preset's plate, the same every time.
var PRESETS = [
    { name: "MIDNIGHT", vals: [82, 68, 69, 65, 64, 64, 0, 41],
      accent: [0.30, 0.55, 0.95], seed: 211,
      pal: pal255([[60, 110, 255], [90, 80, 240], [40, 170, 255], [130, 110, 255], [90, 200, 255]]) },
    { name: "ANGELS",   vals: [127, 75.1996841, 49.9555016, 52.9290428, 78.8252335, 53.0584679, 43, 97.3002472],
      accent: [0.82, 0.56, 0.96], seed: 322,
      pal: pal255([[255, 130, 200], [255, 200, 120], [200, 150, 255], [255, 170, 90], [255, 80, 150]]) },
    { name: "GHOSTS",   vals: [45.9425011, 16.3671646, 80, 66.4476166, 107.789597, 35, 110, 80.5584259],
      accent: [0.40, 0.86, 0.60], seed: 433,
      pal: pal255([[70, 240, 160], [50, 210, 200], [140, 255, 170], [40, 180, 220], [120, 255, 210]]) }
];
(function () { for (var i = 0; i < PRESETS.length; i++) PRESETS[i].stock = true; })();
var bank = PRESETS.slice();                             // the stock presets, then the user's own in the order saved
var slotRef = [PRESETS[0], PRESETS[1], PRESETS[2]];     // what each face slot holds
var loaded = null;      // the preset on the knobs now; null once a knob or SHATTER moves off it
var menu = null;        // the open bank list ("list" is a message name in Max): { slot, scroll, arm } (arm: DELETE is waiting for its second click)
var gmenu = false;      // the glide lengths are open as a list; never open with the bank list
var edit = null;        // the name being typed: { P, slot }
var NAME_MAX = 9;
var BANK_PATH = "~/Documents/GLASS Presets.json";       // one file for every Live set (Andrew, 10-10)
// the plate a fresh device shows before any preset or SHATTER: the icon's own colours
var ICON_PAL = pal255([[255, 60, 40], [255, 60, 40], [255, 140, 50], [255, 200, 90], [60, 220, 230], [70, 120, 255], [240, 70, 170], [150, 90, 255]]);
var ICON_SEED = 108;

// theme
var BG      = [3 / 255, 4 / 255, 8 / 255];
var WHITE   = [1, 1, 1];
var INK_LIT = [1, 0.953, 0.902];                   // the back arrow and the glide text, lit; white under the pointer
var INK_OFF = [172 / 255, 150 / 255, 150 / 255];   // the same marks as unlit glass
var BLACK   = [0, 0, 0];
var CAPFILL = [6 / 255, 7 / 255, 10 / 255];
var LBL_LO  = [150 / 255, 157 / 255, 172 / 255];   // knob label, knob down
var LBL_HI  = [226 / 255, 231 / 255, 241 / 255];   // knob label, knob up
var NEON    = [1, 0.15, 0];                        // drawn-fallback glow, the wordmark's red
var TUBE    = [1, 0.96, 0.92];                     // drawn-fallback tube, warm white

// layout: a fixed design size, 170 tall from the top of the box, width from the box.
// (The box is taller than what Live shows, so nothing here scales by its height.)
var DH = 170, S = 2;                 // S: offscreen images and sprites are 2x for retina
var M = 20, KY = 106, KR = 22, LABEL_Y = 152;
var MIX_ROOM = 96;                   // the room MIX takes at the end of the row
var WMX = 16, WMY = 28, WMH = 38;    // wordmark: left edge, vertical centre, letter height
var WM_W = 780, WM_H = 136;          // wordmark letterforms, in icon pixels
var WM_PAD = Math.round(170 * (WMH * S / WM_H));   // glow room baked around the sprite, sprite px
var PILL_W = 74, PILL_H = 26, PILL_GAP = 4, PILL_Y = 14, PILL_RIGHT = 12;
var SHW = 104, SHH = 32, SPAD = 28;  // SHATTER button, and the glow room around its sprite
var BACK_W = 18, GL_W = 36, HCY = PILL_Y + PILL_H / 2;   // the back arrow and the glide word, either side of SHATTER
var SIDE = 10, BACK_INK = 6.45;      // the arrow's ink and the glide text each stop SIDE px off SHATTER's box; the ink reaches BACK_INK right of the arrow's centre
var BK_CELL = 40, GL_CELL_H = 44, GL_PAD = 16;   // the marks' glow sprites: the arrow's centre is its cell's centre, the glide text starts GL_PAD in
var BR = 96;                         // burst radius
var FLICK_MS = 560;                  // SHATTER: the sign flickers and the new plate comes up hot
// PULSE, Andrew's settings (10-11 13:28, from the mock). Strengths are the lift at MIX 100.
var PULSE_GLOW = 0.4, PULSE_PLATE = 0.25, PULSE_SHARDS = 0.35;
var PULSE_REL = 370;                 // ms to fall to a tenth after a hit; a rise is immediate
var PULSE_FLOOR = -50;               // dBFS that reads as no level
var PULSE_CURVE = 1.6;               // above 1 keeps quiet passages calmer
var PULSE_MIXC = 0.35;               // the lift scales as MIX ^ this; below 1 lifts low MIX (Andrew, 10-11: MIX 18 read as nothing)
var PULSE_STEPS = 64;                // a repaint only when the pulse moves a step this fine
var LED_R = 3.6;                     // the PULSE LED's ring, one SIDE left of the back arrow's ink
var LED_TUBE = [248 / 255, 240 / 255, 224 / 255], LED_GLOW = [248 / 255, 52 / 255, 0], LED_OFF = [168 / 255, 144 / 255, 144 / 255];   // sampled from SHATTER's neon sprites
var LIST_W = 168, LIST_ROW = 17, LIST_MAX = 6, LIST_FOOT = 20, LIST_Y = PILL_Y + PILL_H + 2;   // the bank list, drawn in the face
var GLIST_W = 66, GLIST_ROW = 15;    // the glide list

// arc geometry (cairo: angle clockwise from +x; y is down)
var A0 = Math.PI * 0.75;          // start (lower-left)
var SWEEP = Math.PI * 1.5;        // 270 degrees
var TAU = Math.PI * 2;

// ---- LOM state --------------------------------------------------------------
var rackPath = "";
var params = [];        // params[macroIndex] = LiveAPI on that macro parameter
var pmin = [], pmax = [];
var vals = [];          // current macro values 0..127 (cache for drawing)
var ready = false;

for (var i = 0; i < 8; i++) { vals[i] = 63.5; pmin[i] = 0; pmax[i] = 127; }
vals[MIX] = 127; pmin[MIX] = 0; pmax[MIX] = 127;

// ---- face state + small helpers ---------------------------------------------
var hoverKnob = -1;     // knob under the cursor, or being dragged -> shows its percent
var hoverPreset = -1;   // slot under the cursor (set by onidle)
var hoverZone = "";     // which part of that slot: "name" or "caret"
var hoverRow = -1, hoverFoot = -1;   // bank row and footer button under the cursor, while the list is open
var hoverShatter = false; // cursor over the SHATTER button (set by onidle)
var hoverBack = false, hoverGlide = false, hoverHold = -1;   // the back arrow, the glide word, a knob's label
var hoverGrow = -1;     // glide list row under the cursor, while that list is open
var hoverLed = false;   // the PULSE LED under the cursor
var plate = null;       // what is on the glass now: see makePlate()
var plates = {};        // the fixed plates (icon + one per preset), made once per box width
var trash = [];         // images of a replaced plate, freed at the end of the next paint
var shT = -1, sp = 1;   // SHATTER flicker: start time (ms), progress 0..1
var paints = 0, statusPosted = false;

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function now() { return new Date().getTime(); }
function knobFrac(macro) {
    var f = (vals[macro] - pmin[macro]) / (pmax[macro] - pmin[macro]);
    if (isNaN(f)) f = 0; if (f < 0) f = 0; if (f > 1) f = 1;
    return f;
}
// overall rack "energy" = mean knob fraction; drives the plate's brightness and the sign's glow
function rackEnergy() {
    var s = 0;
    for (var m = 0; m < 8; m++) s += knobFrac(m);
    return s / 8;
}

// h in degrees, s and l 0..1 -> rgb 0..1
function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
// a SHATTER palette: two warm neighbours of the hue, three across the wheel, one back near it
function palFromHue(h) {
    return [hsl(h, 1, 0.6), hsl(h + 28, 1, 0.62), hsl(h + 150, 0.95, 0.6), hsl(h + 185, 1, 0.6), hsl(h + 215, 0.9, 0.65), hsl(h + 320, 1, 0.62)];
}

// Seeded rng (mulberry32), the mock's own, so a preset's plate here is the plate in the mock.
// Math.imul is not in this engine; this is the usual 16-bit split.
function imul(a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
}
function rng(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = imul(a ^ a >>> 15, 1 | a);
        t = t + imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
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
    if (padApi) { try { padApi.property = ""; } catch (e2) {} padApi = null; }
    padFire.cancel();
    for (var k = 0; k < keepApi.length; k++) if (keepApi[k]) { try { keepApi[k].property = ""; } catch (e4) {} }
    keepApi = []; keepVal = [];
}

// resolve parent rack + macro params. On load the device often isn't settled into the
// chain yet, so `this_device` resolves to an empty path and every macro lookup misses.
// Rather than barf a 10-line error block on every load before the real bind lands, we
// retry quietly a handful of times and only complain once the quick tries have run out. A
// single clean "OK rack=… macros bound=8" is the success signal.
// The quick tries are not the end: after them the device looks once a second for as long as it
// has no rack. Nobody can send bang to a frozen device, and a GLASS that reloaded when the Max
// editor closed sat on "connecting" for good after its ten tries (Live 12.4.6, 10-10).
var initAttempts = 0;
var INIT_MAX_RETRIES = 10;          // ~2s of 200ms retries before we warn
var INIT_SLOW_MS = 1000;            // then one look a second until the rack is found
var initWarned = false;             // one warning per run of misses, not one a second
var retryTask = new Task(initLOM);
function retryInit(why) {
    if (initAttempts < INIT_MAX_RETRIES) { initAttempts++; retryTask.schedule(200); return; }
    if (!initWarned) { post_(why); initWarned = true; }
    retryTask.schedule(INIT_SLOW_MS);
}
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
        rackPath = p ? p.replace(/\s+chains\s+\d+\s+devices\s+\d+\s*$/, "") : "";   // no path yet: retry below (it threw here and never retried, seen in Max 10-10)
        if (!p || rackPath === p) {             // not in a rack yet (or not at all) — retry, then warn
            retryInit("WARNING: device path has no parent rack — is it inside the GLASS rack? path=" + p);
            return;
        }
        var rack = new LiveAPI(null, rackPath);
        var plist = rack.get("parameters");     // ["id", 1, "id", 2, ...]
        if (!plist || plist.length < 4) {
            retryInit("ERROR: rack has no parameters at " + rackPath); return;
        }
        params = [];
        var bound = 0;
        for (var m = 0; m <= MIX; m++) {
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
            if (m < 8) bound++;
        }
        if (bound < 8) { retryInit("WARNING: " + bound + " of 8 macros found at " + rackPath + ", still looking"); return; }   // a half-done bind keeps looking, slow after the quick tries
        initAttempts = 0; initWarned = false;
        ready = true;
        var sig = rackPath + " bound=" + bound;     // only announce a *changed* bind
        if (sig !== lastOK) { post_("OK [build " + BUILD + "] rack=" + rackPath + "  macros bound=" + bound); lastOK = sig; }
        try { bindPad(plist); } catch (e3) { post_("EXC pad: " + e3.message); }
        try { bindKeep(plist); } catch (e5) { post_("EXC keep: " + e5.message); }
        mgraphics.redraw();
    } catch (e) {
        if (ready) post_("EXC initLOM: " + e.message);     // bound, and something after the bind threw
        else retryInit("EXC initLOM: " + e.message);       // threw before the bind: look again
    }
}

function onMacroChanged(slot, args) {
    if (!ready) return;   // ignore the immediate bind-time callback and any teardown-race callback
    var v = (args && args.length >= 2 && args[0] === "value") ? args[1] : args[args ? args.length - 1 : 0];
    if (v === undefined || isNaN(v)) return;
    vals[slot] = parseFloat(v);
    // NB: do NOT clear loaded here — these callbacks fire async after loadPreset()
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

// ---- SHATTER on a pad ------------------------------------------------------------
// The rack's tenth macro is SHATTER's pad. It is Live's own control, so a key, a pad, a knob or
// automation maps to it like any other; a control made by the script could not be picked in
// Live's map mode (Live 12.4.6, 10-10). A SHATTER fires each time the macro's value crosses the
// middle, in either direction. An observer may not change Live from inside its own call, so the
// SHATTER is put off a tick.
var PADM = 9;               // the pad's macro index; MIX is 8
var padApi = null, padMid = 63.5;
var padSide = null;         // the half the macro was last in; null until a value is known
var padFire = new Task(function () { doShatter(); });
function onPad(args) {
    if (!ready || !args || args[0] !== "value") return;
    var v = parseFloat(args[1]);
    if (isNaN(v)) return;
    var side = v > padMid;
    if (padSide !== null && side !== padSide) padFire.schedule(1);
    padSide = side;
}
function bindPad(plist) {
    var pid = plist[(PADM + 1) * 2 + 1];
    if (pid === undefined) return;      // a rack with no tenth macro: no pad, the pill still works
    padApi = new LiveAPI(onPad, "id " + pid);
    var lo = parseFloat(padApi.get("min")), hi = parseFloat(padApi.get("max")), v = parseFloat(padApi.get("value"));
    padMid = isNaN(lo) || isNaN(hi) ? 63.5 : (lo + hi) / 2;
    padSide = isNaN(v) ? null : v > padMid;
    padApi.property = "value";          // calls onPad once with the value as it stands
}

// ---- HOLD and GLIDE, kept with the set -------------------------------------------
// A Live set saves a device's parameters and nothing else, and a parameter made by the script
// was not one to lean on (pad test 1, 10-10). So what is held and the glide length are written
// into three more of the rack's macros, which Live saves like any knob: the eleventh holds
// held[0..3] as bits, the twelfth held[4..7], the thirteenth the glide length's number. They need
// not show in the rack. The script watches them too, so a reloaded set and Live's undo both put
// the face back. A rack without them keeps today's behaviour: nothing is remembered.
var KEEPM = [10, 11, 12, 13];   // macro indexes; MIX is 8, the pad 9. 13: PULSE, 0 is on (a rack at its defaults pulses)
var keepApi = [], keepVal = [];     // keepVal[k]: the number last read from or written to that macro
function keepWant(k) {
    if (k === 2) return glideSel;
    if (k === 3) return pulseOn ? 0 : 1;
    for (var n = 0, b = 0; b < 4; b++) if (held[k * 4 + b]) n += 1 << b;
    return n;
}
function keepRead(k, v) {
    v = Math.round(parseFloat(v));
    if (isNaN(v)) return;
    keepVal[k] = v;
    if (k === 2) glideSel = Math.max(0, Math.min(GLIDES.length - 1, v));
    else if (k === 3) pulseOn = v < 1;
    else for (var b = 0; b < 4; b++) held[k * 4 + b] = !!(v & (1 << b));
}
function keepWrite() {
    for (var k = 0; k < KEEPM.length; k++) {
        var n = keepWant(k);
        if (!ready || !keepApi[k] || n === keepVal[k]) continue;
        keepVal[k] = n;
        try { keepApi[k].set("value", n); } catch (e) { post_("EXC keep " + k + ": " + e.message); }
    }
}
function onKeep(k, args) {
    if (!ready || !args || args[0] !== "value") return;
    keepRead(k, args[1]);
    mgraphics.redraw();
}
function bindKeep(plist) {
    for (var k = 0; k < KEEPM.length; k++) {
        var pid = plist[(KEEPM[k] + 1) * 2 + 1];
        if (pid === undefined) continue;
        keepApi[k] = new LiveAPI((function (slot) {
            return function (args) { onKeep(slot, args); };
        })(k), "id " + pid);
        keepRead(k, keepApi[k].get("value"));
        keepApi[k].property = "value";  // calls onKeep once with the value as it stands
    }
}

// ---- BACK, HOLD, GLIDE ---------------------------------------------------------
// BACK steps through SHATTERs and preset loads, glass included; knob drags stay with Live's own
// undo. HOLD keeps a knob out of SHATTER only: a preset load moves every knob. With GLIDE on,
// SHATTER, a preset load and BACK move the knobs over beats or bars of the song's tempo.
var HIST_MAX = 16;
var hist = [];          // { vals, pal, seed, key, loaded } as things stood before each SHATTER and preset load
var held = [];          // held[macro]: SHATTER leaves this knob where it is
var GLIDES = ["OFF", "1/8", "1/4", "1/2", "1 BAR", "2 BARS", "4 BARS"];
var GLIDE_LEN = [0, 0.5, 1, 2, 1, 2, 4];   // quarter notes up to 1/2, bars from 1 BAR on
var glideSel = 0;
var anim = null;        // a glide under way: { from, to, t0, dur, free } (free[macro]: not moved by it)

function glideMs() {
    if (!glideSel) return 0;
    var bpm = 120, num = 4, den = 4;
    try {
        var song = new LiveAPI(null, "live_set");
        bpm = parseFloat(song.get("tempo")) || 120;
        num = parseFloat(song.get("signature_numerator")) || 4;
        den = parseFloat(song.get("signature_denominator")) || 4;
    } catch (e) {}
    var beat = 60000 / bpm;     // a quarter note
    return GLIDE_LEN[glideSel] * (glideSel < 4 ? beat : beat * num * 4 / den);
}
// where the knobs are heading: mid-glide that is the glide's end, not the frame on screen
function aim() {
    var out = vals.slice(0, 8);
    if (anim) for (var m = 0; m < 8; m++) if (!anim.free[m]) out[m] = anim.to[m];
    return out;
}
// jump, or glide there when GLIDE is on. A knob already where it is going is never written, so
// a held knob's automation is left alone.
function moveTo(v) {
    var ms = glideMs(), m;
    glideTask.cancel(); anim = null;
    if (!ms) { for (m = 0; m < 8; m++) if (v[m] !== vals[m]) setMacro(m, v[m]); return; }
    anim = { from: vals.slice(0, 8), to: v.slice(0, 8), t0: now(), dur: ms, free: {} };
    for (m = 0; m < 8; m++) if (v[m] === vals[m]) anim.free[m] = true;
    glideTask.repeat();
}
var glideTask = new Task(function () {
    if (!anim) { glideTask.cancel(); return; }
    var k = Math.min(1, (now() - anim.t0) / anim.dur), e = k * k * (3 - 2 * k);
    for (var m = 0; m < 8; m++) if (!anim.free[m]) setMacro(m, anim.from[m] + (anim.to[m] - anim.from[m]) * e);
    if (k >= 1) { anim = null; glideTask.cancel(); }
});
glideTask.interval = 33;

function pushHist() {
    hist.push({ vals: aim(), pal: plate ? plate.pal : null, seed: plate ? plate.seed : 0, key: plate ? plate.key : "", loaded: loaded });
    if (hist.length > HIST_MAX) hist.shift();
}
function goBack() {
    var h = hist.pop();
    if (!h) return;
    loaded = same(h.loaded) || null;    // a preset deleted since: its knobs and glass, no slot lit
    if (h.pal) setGlass(h.pal, h.seed, h.key);
    moveTo(h.vals);
    mgraphics.redraw();
}

// the knobs are where P puts them (mid-glide: heading there); a controller or automation may have moved them since
function onPreset(P) {
    var at = aim();
    for (var m = 0; m < 8; m++) if (Math.abs(at[m] - P.vals[m]) > 0.01) return false;
    return true;
}
function loadPreset(P) {
    if (!P) return;
    if (loaded !== P || !onPreset(P)) pushHist();
    moveTo(P.vals);
    loaded = P;
    pickPlate();        // this preset's own plate, the same one every time
    mgraphics.redraw();
}
function applyPreset(idx) { if (idx >= 0 && idx < slotRef.length) loadPreset(slotRef[idx]); }   // by face slot

// SHATTER: randomise every macro that is not held, drop any active preset, and re-shatter the
// glass with a freshly-generated palette + plate (unique every time).
function doShatter() {
    var to = [];
    pushHist();
    for (var m = 0; m < 8; m++) to[m] = held[m] ? vals[m] : pmin[m] + Math.random() * (pmax[m] - pmin[m]);   // a held knob stays where it is now, mid-glide too
    moveTo(to);
    loaded = null;
    shatterPlate();     // new palette, new plate, then the sign flickers
    mgraphics.redraw();
}

// messages from Max -----------------------------------------------------------
function bang() { initAttempts = 0; initWarned = false; lastOK = ""; initLOM(); }   // re-resolve (fresh retries + always reports)
function preset(i) { applyPreset(i); }         // "preset 0/1/2": what that face slot holds
function shatter() { doShatter(); }            // randomise all knobs
function back() { goBack(); }                  // undo the last SHATTER or preset load
function hold(i, on) {                          // "hold 3": knob 3 from the left, on and off; "hold 3 1": on
    if (!KNOBS[i]) return;
    var m = KNOBS[i].macro;
    held[m] = on === undefined ? !held[m] : !!on;
    if (held[m] && anim) anim.free[m] = true;   // held mid-glide: it stops where it is
    keepWrite();
    mgraphics.redraw();
}
function glide(n) {                             // "glide": the next length, round to OFF; "glide 4": 1 BAR
    glideSel = n === undefined ? (glideSel + 1) % GLIDES.length : Math.max(0, Math.min(GLIDES.length - 1, n | 0));
    keepWrite();
    mgraphics.redraw();
}
function pulse(on) {                            // "pulse": the face's audio pulse, on and off; "pulse 1": on
    pulseOn = on === undefined ? !pulseOn : !!on;
    keepWrite();
    mgraphics.redraw();
}
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

function kx(i, w) { return i === MIX ? w - M - 34 : M + (w - M * 2 - MIX_ROOM) / 8 * (i + 0.5); }
function pillX(p, w) { return w - PILL_RIGHT - (3 - p) * PILL_W - (2 - p) * PILL_GAP; }

function presetRects() {
    var w = W(), r = [];
    for (var i = 0; i < 3; i++) r.push([pillX(i, w), PILL_Y, PILL_W, PILL_H]);
    return r;
}

// the SHATTER button: centred in the gap between the wordmark's right edge and the
// left edge of the first preset (equidistant from both), on the presets' centre line. In a
// narrow box it gives way to the left, so the glide word on its right still fits.
function shatterRect() {
    var x0 = WMX + WM_W / WM_H * WMH + 14, x1 = pillX(0, W()) - 14, half = (x1 - x0 - SHW) / 2;
    return [x0 + half - Math.max(0, SIDE + GL_W - half), HCY - SHH / 2, SHW, SHH];
}
function backX() { return shatterRect()[0] - SIDE - BACK_INK; }   // the back arrow's centre
function glideX() { return shatterRect()[0] + SHW + SIDE; }       // the glide text's left edge

// ---- drawing helpers (mg = the live mgraphics or an offscreen MGraphics) -------
// stops: [[t, rgb, alpha], ...]
function addStops(p, stops) {
    for (var i = 0; i < stops.length; i++) {
        var c = stops[i][1];
        p.add_color_stop_rgba(stops[i][0], c[0], c[1], c[2], clamp01(stops[i][2]));
    }
}
// An arc as its own piece of path. The move_to puts the current point on the arc's start, so
// nothing left behind by a show_text can be joined to it by a line.
function arcPath(mg, cx, cy, r, a0, a1) {
    mg.move_to(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    mg.arc(cx, cy, r, a0, a1);
}
// A soft falloff without a radial gradient. Max draws nothing for one (measured 10-10 in
// Live: the cap's shadow, its colour and the arc's end glow were all absent). The falloff is
// cut into bands instead, each drawn once at its own alpha, so no pixel is painted twice
// and faint colour is not rounded up layer by layer. stops: one colour, alpha against t.
function falloff(stops, t) {
    for (var i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
            var a = stops[i - 1], b = stops[i];
            return a[2] + (b[2] - a[2]) * (t - a[0]) / (b[0] - a[0]);
        }
    }
    return stops[stops.length - 1][2];
}
function bands(stops, most) { return Math.max(8, Math.min(most, Math.ceil(clamp01(stops[0][2]) * 170))); }
// a disc that fades from its centre out: a small disc, then closed rings that meet edge to edge
// (never more bands than the radius has pixels: a narrower band adds nothing)
function radial(mg, x, y, rad, stops, most) {
    var c = stops[0][1], n = Math.min(bands(stops, most || 64), Math.max(8, Math.ceil(rad))), dr = rad / n, i, a;
    for (i = 1; i <= n; i++) {
        a = clamp01(falloff(stops, (i - 0.5) / n));
        if (a < 0.0015) continue;
        mg.set_source_rgba(c[0], c[1], c[2], a);
        if (i === 1) { arcPath(mg, x, y, dr, 0, TAU); mg.fill(); continue; }
        mg.set_line_width(dr);
        arcPath(mg, x, y, (i - 0.5) * dr, 0, TAU); mg.close_path(); mg.stroke();
    }
}
// a stroke whose colour and alpha run along its length
function fade(mg, x0, y0, x1, y1, stops, lw) {
    var p = mg.pattern_create_linear(x0, y0, x1, y1);
    addStops(p, stops);
    mg.set_source(p); mg.set_line_width(lw);
    mg.move_to(x0, y0); mg.line_to(x1, y1); mg.stroke();
}
function disc(mg, x, y, rad, c, a) {
    mg.set_source_rgba(c[0], c[1], c[2], clamp01(a));
    arcPath(mg, x, y, rad, 0, TAU); mg.fill();
}
function arcStroke(cx, cy, r, a0, a1, lw, c, a) {
    mgraphics.set_source_rgba(c[0], c[1], c[2], clamp01(a));
    mgraphics.set_line_width(lw);
    arcPath(mgraphics, cx, cy, r, a0, a1); mgraphics.stroke();
}
function hline(x0, x1, y, c, a, lw) {
    mgraphics.set_source_rgba(c[0], c[1], c[2], a);
    mgraphics.set_line_width(lw);
    mgraphics.move_to(x0, y); mgraphics.line_to(x1, y); mgraphics.stroke();
}
function fillRect(x, y, w, h, c, a) {
    mgraphics.set_source_rgba(c[0], c[1], c[2], a);
    mgraphics.rectangle(x, y, w, h); mgraphics.fill();
}
function roundRect(x, y, w, h, r) {
    mgraphics.move_to(x + r, y);
    mgraphics.line_to(x + w - r, y); mgraphics.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    mgraphics.line_to(x + w, y + h - r); mgraphics.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    mgraphics.line_to(x + r, y + h); mgraphics.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    mgraphics.line_to(x, y + r); mgraphics.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}
// round line ends, where the engine has them; unproven in Max, so one failure switches it off
var capOK = true;
function lineCap(mode) {
    if (!capOK) return;
    try { mgraphics.set_line_cap(mode); }
    catch (e) { capOK = false; post_("NOTE: set_line_cap is not available, line ends stay square"); }
}

// The image at the current origin, in its own pixels, at alpha a. Max repeats a surface
// source across everything painted (measured 10-10 in Live: paint_with_alpha tiled the glow
// sprites and the bursts over the whole face) and jsui has no clip, so the image is filled
// into its own rectangle. At full strength image_surface_draw does it, which never tiled.
// On an offscreen context a refusal is left to the caller: it is the knob layer's to handle
// and says nothing about the live face.
var alphaFill = !!mgraphics.fill_with_alpha;
if (!alphaFill) post_("NOTE: fill_with_alpha is not available, images draw at full strength");
function stamp(mg, im, a) {
    if (mg !== mgraphics) {
        mg.set_source_surface(im, 0, 0);
        mg.rectangle(0, 0, im.size[0], im.size[1]);
        mg.fill_with_alpha(a);
        return;
    }
    if (a < 1 && alphaFill) {
        try {
            mgraphics.set_source_surface(im, 0, 0);
            mgraphics.rectangle(0, 0, im.size[0], im.size[1]);
            mgraphics.fill_with_alpha(a);
            return;
        } catch (e) { alphaFill = false; post_("NOTE: an image could not be drawn at part strength (" + e.message + "), images draw at full strength"); }
    }
    mgraphics.image_surface_draw(im);
}
// an image drawn at (x, y), scaled by sc, at alpha a
function blit(im, x, y, sc, a) {
    if (!im || a <= 0.003) return;
    mgraphics.save();
    try {
        mgraphics.translate(x, y); mgraphics.scale(sc, sc);
        stamp(mgraphics, im, a);
    } finally { mgraphics.restore(); }
}
// a square image px wide, centred on (cx, cy), drawn d wide, turned by ang, at alpha a
function turned(mg, im, px, cx, cy, d, ang, a) {
    mg.save();
    try {
        var sc = d / px;
        mg.translate(cx, cy); mg.rotate(ang); mg.scale(sc, sc);
        mg.translate(-px / 2, -px / 2);
        stamp(mg, im, Math.min(0.999, clamp01(a)));
    } finally { mg.restore(); }
}

// Letter-spaced text centred on (cx, mid). Character widths are measured once per size.
var chw = {};
var fontArgs = 3;
function setFont(size) {
    if (fontArgs === 3) {
        try { mgraphics.select_font_face(FONT, "normal", FONT_WEIGHT); }
        catch (e) { fontArgs = 2; post_("NOTE: the font weight was refused, text uses the regular face"); }
    }
    if (fontArgs === 2) mgraphics.select_font_face(FONT, "normal");
    mgraphics.set_font_size(size);
}
function charW(ch, size) {              // the font must already be set at this size
    var key = size + "|" + ch, w = chw[key];
    if (w === undefined) {
        if (ch === " ") w = mgraphics.text_measure("n n")[0] - 2 * mgraphics.text_measure("n")[0];
        else w = mgraphics.text_measure(ch)[0];
        if (!(w > 0)) w = size * (ch === " " ? 0.28 : 0.6);
        chw[key] = w;
    }
    return w;
}
function spacedW(str, size, ls) {
    setFont(size);
    var i, n = str.length, total = (n - 1) * ls;
    for (i = 0; i < n; i++) total += charW(str.charAt(i), size);
    return total;
}
function spacedFrom(str, x, mid, size, c, a, ls) {   // the same, from a left edge
    setFont(size);
    var i, n = str.length, base = mid + size * 0.35;   // capitals sit about 0.7 em tall
    mgraphics.set_source_rgba(c[0], c[1], c[2], a);
    for (i = 0; i < n; i++) {
        var ch = str.charAt(i);
        if (ch !== " ") { mgraphics.move_to(x, base); mgraphics.show_text(ch); }
        x += charW(ch, size) + ls;
    }
}
function spaced(str, cx, mid, size, c, a, ls) {
    spacedFrom(str, cx - spacedW(str, size, ls) / 2, mid, size, c, a, ls);
}
// a slot name: gives up letter-spacing first, then size, so nine wide letters still fit
function fitName(str, cx, mid, maxW, c, a) {
    var px = 9.5, ls = 1.6;
    while (spacedW(str, px, ls) > maxW && ls > 0.3) ls = Math.max(0.2, ls - 0.35);
    while (spacedW(str, px, ls) > maxW && px > 6.5) px -= 0.5;
    spaced(str, cx, mid, px, c, a, ls);
}

// ---- sprites: only what needs blur is baked (sprites/, exported from the mock at 2x) ----
// Each has a drawn fallback, because a frozen device may not carry them.
var missing = [];
function loadSprite(file) {
    try {
        var im = new Image(file), sz = im.size;
        if (!sz || !sz[0]) throw new Error("empty");
        return im;
    } catch (e) { missing.push(file); return null; }
}
var spr = {
    wmGlow: loadSprite("glass-wm-glow.png"),     // the sign's glow
    wmTube: loadSprite("glass-wm-tube.png"),     // the lit tube
    wmOff:  loadSprite("glass-wm-off.png"),      // the tube unlit, for the flicker
    neGlow: loadSprite("glass-neon-glow.png"),   // the SHATTER button, same three
    neTube: loadSprite("glass-neon-tube.png"),
    neOff:  loadSprite("glass-neon-off.png"),
    bkGlow: loadSprite("glass-back-glow.png"),   // the back arrow's glow
    glGlow: []                                   // the glide text's glow, one per length (both lines)
};
(function () { for (var i = 0; i < GLIDES.length; i++) spr.glGlow.push(loadSprite("glass-glide-glow-" + i + ".png")); })();
if (missing.length) post_("WARNING: sprite not found, drawing a plain stand-in: " + missing.join(", "));

// ---- the plate: what one SHATTER (or one preset) puts on the glass -------------
// Rendered once into offscreen images at 2x, pixel coordinates multiplied by S and no
// transform on the offscreen context (the path the 10-10 test proved). Per paint the
// images are only blitted. The rng call order is the mock's, line for line.
function burstGeo(r, col, pick) {
    var b = { col: col, rays: [], wedges: [], spikeA: r() * Math.PI }, dirs = [], k;
    for (k = 4 + (r() * 4 | 0); k--;) dirs.push(r() * 7);   // most rays gather into a few sprays, as on the icon
    for (k = 4 + (r() * 4 | 0); k--;) b.wedges.push({ a: r() * 7, da: 0.05 + r() * 0.2, len: 38 + r() * 54, col: pick() });
    for (k = 150; k--;) b.rays.push({ a: r() < 0.74 ? dirs[(r() * dirs.length) | 0] + (r() - r()) * 0.2 : r() * 7, len: 22 + r() * r() * 72, col: pick(), lw: 0.25 + r() * 0.5 });
    return b;
}
var BLOOM_BANDS = 40, WEDGE_BANDS = 14;
function wedge(mg, x, y, w) {            // a shard of colour, strongest at the centre
    var L = w.len * S, c = w.col, stops = [[0, c, 0.34], [1, c, 0]], n = bands(stops, WEDGE_BANDS), i;
    var ax = Math.cos(w.a) * L, ay = Math.sin(w.a) * L, bx = Math.cos(w.a + w.da) * L, by = Math.sin(w.a + w.da) * L;
    for (i = 1; i <= n; i++) {
        var t0 = (i - 1) / n, t1 = i / n;
        mg.set_source_rgba(c[0], c[1], c[2], clamp01(falloff(stops, (i - 0.5) / n)));
        mg.move_to(x + ax * t0, y + ay * t0); mg.line_to(x + ax * t1, y + ay * t1);
        mg.line_to(x + bx * t1, y + by * t1); mg.line_to(x + bx * t0, y + by * t0);
        mg.close_path(); mg.fill();
    }
}
// The soft pieces a knob needs, baked once: the live context has no radial gradient either.
function bake(wpx, hpx, draw) {
    try { var mg = new MGraphics(wpx, hpx); draw(mg); return new Image(mg); }
    catch (e) { post_("EXC bake: " + e.message); return null; }
}
var SHADOW_R = 35, END_R = 9;
var shadowImg = bake(SHADOW_R * 2 * S, SHADOW_R * 2 * S, function (mg) {
    radial(mg, SHADOW_R * S, SHADOW_R * S, SHADOW_R * S, [[0, BLACK, 0.95], [0.37, BLACK, 0.9], [0.6, BLACK, 0.48], [0.77, BLACK, 0.15], [1, BLACK, 0]]);
});
var endGlow = [];
(function () {
    for (var i = 0; i < KNOBS.length; i++) {
        endGlow.push(bake(END_R * 2 * S, END_R * 2 * S, (function (c) {
            return function (mg) { radial(mg, END_R * S, END_R * S, END_R * S, [[0, c, 0.7], [1, c, 0]]); };
        })(KNOBS[i].color)));
    }
})();
// The burst's colour pooled low in the cap: a falloff centred below the cap's middle, kept
// inside the cap's circle. With no clip, each layer is the lens where the two circles
// overlap, drawn nested, largest first, each adding what brings the stack up to the falloff.
// Few enough layers that each one is a whole step of colour.
var DISH_PEAK = 0.42, DISH_N = 22;
function renderDish(col) {
    var c = KR * S, Rc = (KR - 1.8) * S, d = KR * 0.55 * S, R = KR * 1.25 * S;
    return bake(KR * 2 * S, KR * 2 * S, function (mg) {
        var acc = 0, i, T, rho;
        for (i = DISH_N; i >= 1; i--) {
            T = DISH_PEAK * (1 - (i - 0.5) / DISH_N);
            rho = R * i / DISH_N;
            mg.set_source_rgba(col[0], col[1], col[2], 1 - (1 - T) / (1 - acc));
            acc = T;
            if (rho <= Rc - d) arcPath(mg, c, c + d, rho, 0, TAU);
            else if (rho >= Rc + d) arcPath(mg, c, c, Rc, 0, TAU);
            else {
                var y0 = (d * d + Rc * Rc - rho * rho) / (2 * d), h = Math.sqrt(Math.max(0, Rc * Rc - y0 * y0));
                var al = Math.atan2(y0, h), be = Math.atan2(y0 - d, h);
                mg.move_to(c + h, c + y0);
                mg.arc(c, c, Rc, al, Math.PI - al);
                mg.arc(c, c + d, rho, Math.PI - be, TAU + be);
                mg.close_path();
            }
            mg.fill();
        }
    });
}
function renderBurst(b, r) {
    var d = BR * 2 * S, x = BR * S, y = BR * S, i;
    var mg = new MGraphics(d, d);
    radial(mg, x, y, BR * S, [[0, b.col, 0.42], [0.22, b.col, 0.2], [0.55, b.col, 0.06], [1, b.col, 0]], BLOOM_BANDS);   // stands in for bloom
    for (i = 0; i < b.wedges.length; i++) {                 // refracted shard wedges
        wedge(mg, x, y, b.wedges[i]);
    }
    for (i = 0; i < b.rays.length; i++) {                   // crack rays, each over a wide faint underlay
        var q = b.rays[i], ex = x + Math.cos(q.a) * q.len * S, ey = y + Math.sin(q.a) * q.len * S;
        fade(mg, x, y, ex, ey, [[0, q.col, 0.2], [1, q.col, 0]], q.lw * 4.5 * S);
        fade(mg, x, y, ex, ey, [[0, mix(q.col, WHITE, 0.35), 0.75], [0.14, q.col, 0.9], [1, q.col, 0]], q.lw * S);
    }
    for (i = 0; i < 60; i++) {                              // sparks
        var a = r() * 7, dd = 26 + r() * 62, rad = 0.25 + r() * r() * 1.1, col = r() < 0.35 ? WHITE : mix(b.col, WHITE, r() * 0.5);
        var sx = x + Math.cos(a) * dd * S, sy = y + Math.sin(a) * dd * S;
        disc(mg, sx, sy, rad * S, col, (0.45 + r() * 0.55) * (1 - dd / BR));
        if (rad > 0.85) radial(mg, sx, sy, rad * 5 * S, [[0, col, 0.3], [1, col, 0]]);
    }
    return new Image(mg);
}
var plateSeq = 0;
function makePlate(pal, seed, w) {
    var t0 = now(), r = rng(seed), i, n, col;
    function pick() { return pal[(r() * pal.length) | 0]; }
    var P = { id: ++plateSeq, pal: pal, seed: seed, w: w, img: null, bursts: [], throws: [], ms: 0, key: "" };   // key: set on a kept plate
    try {                                                   // cold glass: faint colour, hairline fractures, dust
        var mg = new MGraphics(Math.round(w * S), DH * S);
        mg.set_source_rgba(BG[0], BG[1], BG[2], 1);
        mg.rectangle(0, 0, Math.round(w * S), DH * S); mg.fill();
        for (i = 0; i < 12; i++) {
            col = pick();
            radial(mg, r() * w * S, r() * DH * S, (70 + r() * 170) * S, [[0, col, 0.03 + r() * 0.045], [1, col, 0]]);
        }
        for (i = 0; i < 90; i++) {
            var x = r() * w, y = r() * DH, a = r() * Math.PI, l0 = 40 + r() * 380, l1 = 40 + r() * 380;
            col = pick();
            mg.set_source_rgba(col[0], col[1], col[2], 0.05 + r() * 0.17);
            mg.set_line_width((0.25 + r() * 0.4) * S);
            mg.move_to((x - Math.cos(a) * l0) * S, (y - Math.sin(a) * l0) * S);
            mg.line_to((x + Math.cos(a) * l1) * S, (y + Math.sin(a) * l1) * S); mg.stroke();
        }
        for (i = 0; i < 420; i++) {
            col = r() < 0.3 ? WHITE : pick();
            var da = (0.3 + r() * 0.5) * 0.5, dx = r() * w, dy = r() * DH;
            disc(mg, dx * S, dy * S, (0.2 + r() * r() * 1.05) * S, col, da);
        }
        P.img = new Image(mg);
    } catch (e) { post_("EXC plate: " + e.message); }
    for (i = 0; i < KNOBS.length; i++) {
        var bc = mix(KNOBS[i].color, pal[i % pal.length], 0.38);
        var kp = (function (c) { return function () { return r() < 0.65 ? c : pick(); }; })(bc);
        var geo = burstGeo(r, bc, kp), img = null;
        try { img = renderBurst(geo, r); }
        catch (e2) { post_("EXC burst " + i + ": " + e2.message); }
        P.bursts.push({ img: img, dish: renderDish(bc), col: bc, spin: r() < 0.5 ? -1 : 1 });
        var t = [];                                         // fractures this knob throws across the plate when it is up
        for (n = 7 + (r() * 4 | 0); n--;) {
            var th = { a: r() * Math.PI, l0: 50 + r() * r() * 330, l1: 50 + r() * r() * 330, col: kp(), lw: 0.3 + r() * 0.5, k: 0.45 + r() * 0.55, ox: (r() - 0.5) * 7, oy: (r() - 0.5) * 7 };
            th.hot = mix(th.col, WHITE, 0.3);
            t.push(th);
        }
        P.throws.push(t);
    }
    P.ms = now() - t0;
    return P;
}

function retire(P) {                    // queue a plate's images; paint frees them when it is done
    if (!P) return;
    if (P.img) trash.push(P.img);
    for (var i = 0; i < P.bursts.length; i++) {
        if (P.bursts[i].img) trash.push(P.bursts[i].img);
        if (P.bursts[i].dish) trash.push(P.bursts[i].dish);
    }
}
function emptyTrash() {
    while (trash.length) { try { trash.pop().freepeer(); } catch (e) {} }
}
// the icon's plate and the stock presets' are fixed and kept; a SHATTER plate, and a saved
// preset's, is made when it is wanted and never kept
function setGlass(pal, seed, key) {
    var w = W();
    if (plate && plate.seed === seed && plate.w === w) return;   // already on the glass
    if (plate && !plate.key) retire(plate);
    if (key && plates[key]) { plate = plates[key]; return; }
    plate = makePlate(pal, seed, w);
    if (key) { plate.key = key; plates[key] = plate; }
}
function pickPlate() {
    if (!loaded) setGlass(ICON_PAL, ICON_SEED, "icon");
    else setGlass(loaded.pal, loaded.seed, loaded.stock ? "p" + PRESETS.indexOf(loaded) : "");
}
function shatterPlate() {
    if (plate && !plate.key) retire(plate);
    plate = makePlate(palFromHue(Math.random() * 360), (Math.random() * 1e9) | 0, W());
    shT = now(); sp = 0;
    if (!flickTask.running) flickTask.repeat();
}
// the box changed width: the same plate again at the new size (same palette, same seed)
function regenPlates() {
    var k, cur = plate;
    for (k in plates) if (plates.hasOwnProperty(k)) retire(plates[k]);
    plates = {};
    if (!cur) { pickPlate(); mgraphics.redraw(); return; }
    if (!cur.key) retire(cur);
    plate = makePlate(cur.pal, cur.seed, W());
    if (cur.key) { plate.key = cur.key; plates[cur.key] = plate; }
    mgraphics.redraw();
}
var regenTask = new Task(regenPlates);

// SHATTER plays for about half a second, the only animation on the face
function lit() { return sp >= 1 ? 1 : sp < 0.07 ? 0.12 : sp < 0.15 ? 1 : sp < 0.22 ? 0.25 : sp < 0.33 ? 1 : sp < 0.39 ? 0.5 : 1; }
function flash() { return Math.max(0, 1 - sp * 2.4); }
var flickTask = new Task(function () {
    if (shT < 0 || now() - shT >= FLICK_MS) { shT = -1; flickTask.cancel(); }
    mgraphics.redraw();
});
flickTask.interval = 33;   // ~30 fps, for 560 ms

// ---- PULSE ------------------------------------------------------------------------
// "level <peak>" arrives every 33 ms from the tap (makeTap). The peak is the left and right
// channels summed into one peakamp~, halved to their average, which is what the mock read.
// A hit lifts the envelope at once; it falls to a tenth over PULSE_REL, and a steady level holds
// it steady. The face repaints only while the envelope moves a visible step, and never while
// PULSE is off or MIX is at 0. When the levels stop (device or engine off) pulseTask lets it
// fall to rest; it runs only while the envelope is above rest and PULSE shows.
var pulseOn = true, pulseEnv = 0, pulseT = 0, pulseHeard = 0, levels = 0;
var PULSE_QUIET = 100;               // ms with no level before the face falls on its own
function pulseScale() { return pulseOn ? Math.pow(knobFrac(MIX), PULSE_MIXC) : 0; }
function pulseAmt(strength) { return strength * pulseEnv * pulseScale(); }
// the envelope brought up to now, never under lin; true when it moved a visible step
function pulseFall(lin) {
    var t = now(), dt = pulseT ? t - pulseT : 33, before = pulseEnv;   // a late message falls further, as the sound did
    pulseT = t;
    pulseEnv = Math.max(lin, pulseEnv * Math.exp(-dt / PULSE_REL * 2.3));
    if (pulseEnv < 0.004) pulseEnv = 0;
    return Math.round(pulseEnv * PULSE_STEPS) !== Math.round(before * PULSE_STEPS);
}
function level(v) {
    levels++;
    v = parseFloat(v) * 0.5;
    if (isNaN(v)) return;
    pulseHeard = now();
    var db = v > 0 ? 20 * Math.log(v) / Math.LN10 : -120;
    var lin = Math.pow(clamp01((db - PULSE_FLOOR) / -PULSE_FLOOR), PULSE_CURVE);
    var moved = pulseFall(lin);
    if (pulseScale() <= 0) return;
    if (moved) mgraphics.redraw();
    if (pulseEnv && !pulseTask.running) pulseTask.repeat();
}
var pulseTask = new Task(function () {
    if (!pulseEnv || pulseScale() <= 0) { pulseTask.cancel(); return; }
    if (now() - pulseHeard > PULSE_QUIET && pulseFall(0)) mgraphics.redraw();
    if (!pulseEnv) pulseTask.cancel();
});
pulseTask.interval = 33;
// PULSE or MIX back on after the levels stopped: the envelope falls for the time it was not
// shown before this paint draws it, and the task takes it from there (called from paint, no redraw)
function pulseWake() {
    if (!pulseEnv || pulseTask.running || pulseScale() <= 0) return;
    if (now() - pulseHeard > PULSE_QUIET) pulseFall(0);
    if (pulseEnv) pulseTask.repeat();
}
// The tap: plugin~'s two outlets into one peakamp~ 33, then "prepend level" into this jsui, made
// at load below the part of the patcher a Live device shows. A device saved with it finds it by
// name. If it cannot be made the face draws as it did before PULSE, and says so once.
var tapTried = false, tapState = "not tried";
function makeTap() {
    if (tapTried) return;
    tapTried = true;
    var p = me.patcher, pk = null, pr = null, src = null, o;
    try { pk = p.getnamed("glasspeak"); } catch (e) {}
    if (pk) { tapState = "found"; return; }
    try {
        for (o = p.firstobject; o; o = o.nextobject) if (o.maxclass === "plugin~") { src = o; break; }
        if (!src) { tapState = "no plugin~ in this device"; return; }
        pk = p.newdefault(240, 440, "peakamp~", 33);
        pr = p.newdefault(240, 470, "prepend", "level");
        pk.varname = "glasspeak";
        p.connect(src, 0, pk, 0); p.connect(src, 1, pk, 0); p.connect(pk, 0, pr, 0); p.connect(pr, 0, box, 0);
        tapState = "made";
    } catch (e) {
        tapState = "could not be made (" + e.message + "), the face does not pulse";
        try { if (pk) p.remove(pk); if (pr) p.remove(pr); } catch (e2) {}
    }
}

// ---- the bank file ----------------------------------------------------------
// One JSON file holds the user's presets and what the three slots show, for every Live set.
// A save writes it first; nothing else creates it. Other GLASS devices write the same file, so
// it is read again before anything here changes it. The File calls are the ones
// glass-preset-test.jsui.js ran in Live (10-10): a tilde path, written and read back. There a
// write into a missing folder reported nothing, so every write is checked by reading it back.
var onDisk = false, bankWarned = false;
function readText(path) {
    var f = new File(path, "read");
    if (!f.isopen) return null;
    var s = "", n = 0, end = f.eof;
    while (f.position < end && n++ < 400) {
        var chunk = f.readstring(800);
        if (!chunk) break;
        s += chunk;
    }
    f.close();
    return s;
}
function writeText(path, s) {
    var f = new File(path, "write", "TEXT");
    if (!f.isopen) return;
    try { f.eof = 0; } catch (e) {}
    f.writestring(s);
    f.close();
}
function round(v, k) { return Math.round(v * k) / k; }
function cleanName(s) {     // capitals, plain characters, nine at most
    return String(s).toUpperCase().replace(/[^\x20-\x7E]/g, "").replace(/^\s+/, "").slice(0, NAME_MAX).replace(/\s+$/, "");
}
function newId() { return now() + "-" + ((Math.random() * 1e6) | 0); }
function findUser(id) {
    for (var i = PRESETS.length; i < bank.length; i++) if (bank[i].id === id) return bank[i];
    return null;
}
function same(P) { return !P || P.stock ? P : findUser(P.id); }   // a preset held from before a read, as it is now
function bankText() {
    var out = { version: 1, slots: [], presets: [] }, i, k, P, pal;
    for (i = 0; i < slotRef.length; i++) out.slots.push(slotRef[i].stock ? "stock " + PRESETS.indexOf(slotRef[i]) : slotRef[i].id);
    for (i = PRESETS.length; i < bank.length; i++) {
        P = bank[i]; pal = [];
        for (k = 0; k < P.pal.length; k++) pal.push([round(P.pal[k][0], 1e4), round(P.pal[k][1], 1e4), round(P.pal[k][2], 1e4)]);
        out.presets.push({ id: P.id, name: P.name, seed: P.seed, vals: P.vals.map(function (v) { return round(v, 100); }), pal: pal });
    }
    return JSON.stringify(out);
}
function parseBank(s) {     // { users, slots }, or null when the text is not a bank
    var d, users = [], i, k, q, P;
    try { d = JSON.parse(s); } catch (e) { return null; }
    if (!d || !d.presets || d.presets.length === undefined) return null;
    for (i = 0; i < d.presets.length; i++) {
        try {               // an entry that is not a whole preset is left out
            q = d.presets[i];
            if (q.vals.length !== 8 || !q.pal.length) continue;
            P = { id: q.id === undefined ? newId() : String(q.id), name: cleanName(q.name) || "USER", seed: q.seed | 0, vals: [], pal: [] };
            for (k = 0; k < 8; k++) P.vals.push(Number(q.vals[k]) || 0);
            for (k = 0; k < q.pal.length; k++) P.pal.push([clamp01(Number(q.pal[k][0]) || 0), clamp01(Number(q.pal[k][1]) || 0), clamp01(Number(q.pal[k][2]) || 0)]);
            P.accent = P.pal[0];
            users.push(P);
        } catch (e2) {}
    }
    return { users: users, slots: d.slots || [] };
}
// take what is on disk. No file means nothing has been saved yet, and what is in memory stands.
function syncBank() {
    var s = null, d, i, m;
    try { s = readText(BANK_PATH); } catch (e) {}
    if (s === null) return;
    d = parseBank(s);
    if (!d) {
        if (!bankWarned) { bankWarned = true; post_("WARNING: " + BANK_PATH + " could not be read as presets; the next save replaces it"); }
        return;
    }
    onDisk = true;
    bank = PRESETS.concat(d.users);
    for (i = 0; i < slotRef.length; i++) {
        m = /^stock (\d+)$/.exec(String(d.slots[i]));
        slotRef[i] = (m ? PRESETS[+m[1]] : findUser(String(d.slots[i]))) || PRESETS[i];
    }
    loaded = same(loaded);
    if (edit) { edit.P = same(edit.P); if (!edit.P) endEdit(); }
    if (menu) menu.scroll = Math.min(menu.scroll, maxScroll());
}
function saveBank() {
    var body = bankText(), back = null;
    try {
        writeText(BANK_PATH, body);
        back = readText(BANK_PATH);
        if (back !== null && back.length > body.length) {   // a longer file was not cut short: blank its tail
            var pad = "";
            while (pad.length < back.length - body.length) pad += " ";
            writeText(BANK_PATH, body + pad);
            back = readText(BANK_PATH);
        }
    } catch (e) { back = null; }
    onDisk = back !== null && back.replace(/\s+$/, "") === body;
    if (!onDisk && !bankWarned) { bankWarned = true; post_("WARNING: presets could not be saved to " + BANK_PATH + "; they last until this device is closed"); }
}
function keepSlots() { if (onDisk) saveBank(); }   // what the slots show is kept once a bank file exists

function nextUser() {
    for (var n = 1; ; n++) {
        var name = "USER " + n, taken = false;
        for (var i = 0; i < bank.length; i++) if (bank[i].name === name) taken = true;
        if (!taken) return name;
    }
}
// a saved preset keeps the knob values and the glass it was saved on (palette and seed), so a
// SHATTER comes back the same. Its accent is the first palette colour.
function saveNew() {
    var P = { id: newId(), name: nextUser(), vals: aim(), accent: plate.pal[0], pal: plate.pal, seed: plate.seed };
    bank.push(P); loaded = P;
    return P;
}
function removePreset(P) {  // stock presets stay; a slot that held P goes back to its stock one
    var i = bank.indexOf(P);
    if (i < PRESETS.length) return;
    bank.splice(i, 1);
    for (var s = 0; s < slotRef.length; s++) if (slotRef[s] === P) slotRef[s] = PRESETS[s];
    if (loaded === P) loaded = null;
}

// ---- the name box -----------------------------------------------------------
// A Max text box named "namebox" lies over the face, hidden until a name is typed. Its left
// outlet reaches this script as "te0 ..." (the text, on Return) and its second as "te1 n" (each
// key, Return's 13 ahead of the text). Moving, showing, filling and focusing it are the calls
// the 10-10 test ran in Live. Not run there: "bang" to make the box give up its text when the
// click lands somewhere else; if it gives nothing, that click leaves the name as it was.
// A device saved without the box gets one made at load (makeBox), with its two "prepend"
// objects, below the part of the patcher a Live device shows. If that fails the device still
// saves: presets are named USER n and RENAME stays dim.
var me = this, tb = null, late = null, boxTried = false, boxMade = false;
function nameBox() {
    if (tb) return tb;
    try { var o = me.patcher.getnamed("namebox"); if (o && o.maxclass === "textedit") tb = o; } catch (e) {}
    if (!tb) makeBox();
    if (tb) dressBox();
    return tb;
}
var BOX_LOOK = [["lines", 1], ["keymode", 1], ["tabmode", 0], ["nosymquotes", 1], ["fontname", "Arial"], ["fontsize", 10],
    ["bgcolor", 0.05, 0.055, 0.07, 1], ["textcolor", 1, 1, 1, 1], ["bordercolor", 1, 1, 1, 0.75], ["border", 1], ["rounded", 0],
    ["presentation", 1], ["hidden", 1]];
// the look goes on at every load, one plain call each: the first made box came up white in Max (10-10 19:09)
var boxDressed = false;
function dressBox() {
    if (boxDressed) return;
    boxDressed = true;
    var bad = [], i, a;
    for (i = 0; i < BOX_LOOK.length; i++) {
        a = BOX_LOOK[i];
        try { if (a.length === 2) tb.message(a[0], a[1]); else tb.message(a[0], a[1], a[2], a[3], a[4]); }
        catch (e) { bad.push(a[0] + " (" + e.message + ")"); }
    }
    if (bad.length) post_("NOTE: the name box refused " + bad.join(", "));
}
function makeBox() {        // once per load; a saved device keeps the box, so the next load finds it
    if (boxTried) return;
    boxTried = true;
    var p = me.patcher, t = null, a = null, b = null;
    try {
        t = p.newdefault(8, 400, "textedit");
        a = p.newdefault(8, 440, "prepend", "te0");
        b = p.newdefault(120, 440, "prepend", "te1");
        t.varname = "namebox";
        p.connect(t, 0, a, 0); p.connect(t, 1, b, 0); p.connect(a, 0, box, 0); p.connect(b, 0, box, 0);
        tb = t; boxMade = true;
    } catch (e) {
        post_("NOTE: the name box could not be made (" + e.message + "), saves are named USER n");
        try { if (t) p.remove(t); if (a) p.remove(a); if (b) p.remove(b); } catch (e2) {}
        return;
    }
    try { p.bringtofront(t); } catch (e4) {}
}
function hideBox() { if (tb) { try { tb.message("hidden", 1); } catch (e) {} } }
function faceOrigin() {     // where this jsui sits in the device, so the box lands on the slot
    try { var r = box.getboxattr("presentation_rect"); if (r[0] >= 0 && r[1] >= 0) return [r[0], r[1]]; } catch (e) {}
    return [0, 0];
}
function openEdit(P, slot) {
    leaveEdit();
    menu = null;
    if (!nameBox()) return;
    var o = faceOrigin(), r = box.rect, x = pillX(slot, W()) + 1, y = PILL_Y + 2;
    edit = { P: P, slot: slot };
    try {
        tb.message("presentation_rect", o[0] + x, o[1] + y, PILL_W - 2, 15);
        tb.message("patching_rect", r[0] + x, r[1] + y, PILL_W - 2, 15);    // the saved device opens in its patching view (read off the file 10-10)
        tb.message("hidden", 0);
        tb.message("set", P.name);
        tb.message("select");
    } catch (e) { post_("EXC name box: " + e.message); endEdit(); }
    mgraphics.redraw();
}
function endEdit() { edit = null; late = null; endTask.cancel(); hideBox(); mgraphics.redraw(); }
var endTask = new Task(function () { if (edit) endEdit(); });
function leaveEdit() {      // a click somewhere else keeps what was typed
    if (!edit) return;
    late = { P: edit.P, t: now() };
    try { tb.message("bang"); } catch (e) {}
    if (edit) { edit = null; endTask.cancel(); hideBox(); }   // the text, if it comes, lands through late
}
function te0() {            // the box's text
    var a = arrayfromargs(arguments);
    if (a[0] === "text") a.shift();
    var P = edit ? edit.P : late && now() - late.t < 500 ? late.P : null;
    if (!P) return;
    var name = cleanName(a.join(" "));
    endEdit();
    if (name && name !== P.name) {
        syncBank(); P = same(P);
        if (P) { P.name = name; saveBank(); }
    }
    mgraphics.redraw();
}
function te1(k) {           // a key typed in the box
    if (!edit) return;
    if (k === 27) endEdit();                    // Esc leaves the name as it was
    else if (k === 13) endTask.schedule(80);    // Return on an empty box sends no text: close anyway
}

// ---- paint ------------------------------------------------------------------
// Each section is guarded: a drawing call this engine refuses posts once and the rest draws.
var failed = {};
function guard(name, fn, F) {
    try { fn(F); }
    catch (e) {
        if (!failed[name]) { failed[name] = true; post_("EXC paint/" + name + ": " + e.message); }
        lineCap("butt");
    }
}

function paint() {
    var t0 = now(), w = W(), h = H(), i;
    sp = shT < 0 ? 1 : Math.min(1, (t0 - shT) / FLICK_MS);
    pulseWake();
    var F = { w: w, energy: rackEnergy(), fl: flash(), on: lit(), K: [], own: 0 };
    for (i = 0; i < KNOBS.length; i++) {
        var f = knobFrac(KNOBS[i].macro);
        F.K.push({ k: KNOBS[i], i: i, f: f, cx: kx(i, w), a: A0 + SWEEP * f, hot: hoverKnob === i, B: plate ? plate.bursts[i] : null });
    }

    mgraphics.set_source_rgba(BG[0], BG[1], BG[2], 1);
    mgraphics.rectangle(0, 0, w, h); mgraphics.fill();

    F.own = ownKnob(F);
    guard("plate", drawPlate, F);
    guard("others", drawOthers, F);
    guard("own", drawOwn, F);
    guard("pulse", drawPulse, F);
    guard("header", drawHeader, F);
    guard("wordmark", drawWordmark, F);
    guard("shatter", drawShatterBtn, F);
    guard("back", drawBack, F);
    guard("led", drawLed, F);
    guard("glide", drawGlide, F);
    guard("slots", drawSlots, F);
    for (i = 0; i < F.K.length; i++) guard("knob", drawKnob, F.K[i]);
    guard("mix", drawMix, F);
    guard("list", drawList, F);
    guard("glist", drawGlist, F);

    if (!ready) {
        mgraphics.set_source_rgba(0.40, 0.72, 0.78, 0.85);
        mgraphics.select_font_face(FONT, "normal");
        mgraphics.set_font_size(10);
        mgraphics.move_to(WMX, DH - 3);
        mgraphics.show_text("connecting to GLASS rack…  (send 'bang' to retry)");
    }

    emptyTrash();
    if (plate && plate.w !== w) regenTask.schedule(120);   // box width changed under us
    paints++;
    if (paints >= 3 && !statusPosted) {
        statusPosted = true;
        post_("face " + BUILD + "  box " + w + "x" + h + "  plate " + (plate ? plate.ms : -1) + " ms  paint " + (now() - t0) + " ms");
    }
}

// cold glass, brighter as the patch comes up
function drawPlate(F) {
    if (plate && plate.img) blit(plate.img, 0, 0, 1 / S, Math.min(1, 0.3 + 0.7 * F.energy + F.fl * 0.4 + pulseAmt(PULSE_PLATE)));
}

// thrown fractures: long, crisp, only as bright as the knob is up.
// k: 1 on the face, S on an offscreen image (pixel coordinates, no transform on the context)
function throwsOf(mg, q, fl, k) {
    var f = q.f, A = Math.min(1, Math.pow(f, 1.4) * (q.hot ? 1.25 : 1) + fl * 0.25);
    if (A < 0.01) return;
    var T = plate.throws[q.i], s = (0.35 + 0.65 * f) * k;
    for (var n = 0; n < T.length; n++) {
        var t = T[n], x = (q.cx + t.ox) * k, y = (KY + t.oy) * k, dx = Math.cos(t.a), dy = Math.sin(t.a), l0 = t.l0 * s, l1 = t.l1 * s;
        fade(mg, x - dx * l0, y - dy * l0, x + dx * l1, y + dy * l1, [[0, t.col, 0], [l0 / (l0 + l1), t.hot, t.k * A], [1, t.col, 0]], t.lw * k);
    }
}

// the burst grows, brightens and turns with the value
function burstOf(mg, q, fl, k) {
    var B = q.B, f = q.f;
    if (!B) return;
    var a = Math.min(1, Math.pow(f, 0.75) * 1.08 + (q.hot ? 0.1 : 0) + fl * 0.3);
    if (a < 0.004) return;
    var d = BR * 2 * (0.46 + 0.74 * f + (q.hot ? 0.05 : 0)) * k;
    if (B.img) turned(mg, B.img, BR * 2 * S, q.cx * k, KY * k, d, B.spin * f * 1.7, a);
    else radial(mg, q.cx * k, KY * k, d / 2, [[0, B.col, 0.42 * a], [0.22, B.col, 0.2 * a], [0.55, B.col, 0.06 * a], [1, B.col, 0]]);
}

// ---- the knob layer -----------------------------------------------------------
// A drag repaints on every mouse move and only one knob changes, so the other seven knobs'
// fractures and bursts are kept as one image and the knob in hand is drawn over it. The order
// is the same with and without the image (plate, the others, the own knob), so nothing moves
// when it comes into use. It is baked when the same picture is wanted two paints running:
// several knobs moving at once never bake, and draw as before. Never during the SHATTER flash.
var layer = { on: true, img: null, key: "", want: "", own: 0, last: [] };
function step(f) { return Math.round(f * 4096); }
// the own knob: the one whose value moved since the last paint, else the one under the cursor
function ownKnob(F) {
    var n = 0, ch = -1, i, v;
    for (i = 0; i < F.K.length; i++) {
        v = step(F.K[i].f);
        if (v !== layer.last[i]) { n++; ch = i; }
        layer.last[i] = v;
    }
    if (n === 1) layer.own = ch;
    else if (hoverKnob >= 0 && hoverKnob < F.K.length) layer.own = hoverKnob;
    return layer.own;
}
function layerKey(F) {
    var s = plate.id + "|" + F.w + "|" + F.own, i;
    for (i = 0; i < F.K.length; i++) if (i !== F.own) s += "|" + step(F.K[i].f) + (F.K[i].hot ? "h" : "");
    return s;
}
function others(mg, F, fl, k) {
    var i;
    for (i = 0; i < F.K.length; i++) if (i !== F.own) throwsOf(mg, F.K[i], fl, k);
    for (i = 0; i < F.K.length; i++) if (i !== F.own) burstOf(mg, F.K[i], fl, k);
}
function bakeLayer(F, key) {
    var img;
    try {
        var mg = new MGraphics(Math.round(F.w * S), DH * S);
        others(mg, F, 0, S);
        img = new Image(mg);
    } catch (e) {
        layer.on = false;
        post_("NOTE: the knob layer could not be baked (" + e.message + "), every knob is drawn on each paint");
        return;
    }
    if (layer.img) trash.push(layer.img);
    layer.img = img; layer.key = key;
}
function drawOthers(F) {
    if (!plate) return;
    var key = layer.on && shT < 0 ? layerKey(F) : "";
    if (key && key !== layer.key && key === layer.want) bakeLayer(F, key);
    layer.want = key;
    if (key && key === layer.key && layer.img) { blit(layer.img, 0, 0, 1 / S, 1); return; }
    others(mgraphics, F, F.fl, 1);
}
function drawOwn(F) {
    if (!plate) return;
    throwsOf(mgraphics, F.K[F.own], F.fl, 1);
    burstOf(mgraphics, F.K[F.own], F.fl, 1);
}
// PULSE on the shards: all eight knobs' fractures and bursts as one image, drawn again over
// them at the pulse, so each lifts in proportion to its own brightness and a knob at 0 stays
// dark. Baked once the same knobs have been wanted SHARDS_STILL ms (moving knobs never bake, and
// the level's repaints between a glide's steps do not count as still), with the calls bakeLayer
// makes. Not during the SHATTER flicker. Paint never asks for a paint: shardTask brings the one
// that bakes, after the knobs have held still.
var shards = { img: null, key: "", want: "", t: 0 };
var SHARDS_STILL = 100;
var shardTask = new Task(function () { mgraphics.redraw(); });
function drawPulse(F) {
    var a = pulseAmt(PULSE_SHARDS), key, i, K, mg;
    if (!plate) return;
    key = plate.id + "|" + F.w;
    for (i = 0; i < F.K.length; i++) key += "|" + step(F.K[i].f);
    if (key !== shards.want) { shards.want = key; shards.t = now(); }
    if (a <= 0.003 || shT >= 0) return;
    if (key !== shards.key && now() - shards.t >= SHARDS_STILL) {
        K = [];
        for (i = 0; i < F.K.length; i++) K.push({ k: F.K[i].k, i: i, f: F.K[i].f, cx: F.K[i].cx, hot: false, B: F.K[i].B });
        mg = new MGraphics(Math.round(F.w * S), DH * S);
        others(mg, { K: K, own: -1 }, 0, S);
        if (shards.img) trash.push(shards.img);
        shards.img = new Image(mg); shards.key = key;
    }
    if (shards.img && shards.key === key) blit(shards.img, 0, 0, 1 / S, a);
    else { shardTask.cancel(); shardTask.schedule(SHARDS_STILL); }   // a paint once they hold still bakes them
}
// the header reads over the field, and a faint rake of light crosses the glass
function drawHeader(F) {
    var w = F.w, p = mgraphics.pattern_create_linear(0, 0, 0, 60);
    p.add_color_stop_rgba(0, BG[0], BG[1], BG[2], 0.88);
    p.add_color_stop_rgba(0.7, BG[0], BG[1], BG[2], 0.6);
    p.add_color_stop_rgba(1, BG[0], BG[1], BG[2], 0);
    mgraphics.set_source(p);
    mgraphics.rectangle(0, 0, w, 60); mgraphics.fill();
    p = mgraphics.pattern_create_linear(0, 0, w * 0.5, DH * 1.6);
    p.add_color_stop_rgba(0, 1, 1, 1, 0.05);
    p.add_color_stop_rgba(0.5, 1, 1, 1, 0.008);
    p.add_color_stop_rgba(1, 1, 1, 1, 0);
    mgraphics.set_source(p);
    mgraphics.move_to(0, 0); mgraphics.line_to(w * 0.58, 0); mgraphics.line_to(w * 0.4, DH); mgraphics.line_to(0, DH);
    mgraphics.close_path(); mgraphics.fill();
}

// the neon sign: its glow breathes with the patch's energy and it flickers on SHATTER
function drawWordmark(F) {
    var on = F.on;
    if (spr.wmGlow && spr.wmTube) {
        var x = WMX - WM_PAD / S, y = WMY - spr.wmTube.size[1] / S / 2;
        if (on < 1) blit(spr.wmOff, x, y, 1 / S, 1);
        blit(spr.wmGlow, x, y, 1 / S, on * (0.66 + 0.34 * F.energy));
        blit(spr.wmGlow, x, y, 1 / S, on * pulseAmt(PULSE_GLOW));     // PULSE: the glow once more; the tube stays steady
        blit(spr.wmTube, x, y, 1 / S, on);
        return;
    }
    // no sprite: the old hollow-letter tube, a wide glow stroke under a thin bright one
    mgraphics.select_font_face(FONT, "normal");
    mgraphics.set_font_size(30);
    mgraphics.move_to(WMX, WMY + 11); mgraphics.text_path("G L A S S");
    mgraphics.set_source_rgba(NEON[0], NEON[1], NEON[2], (0.2 + 0.14 * F.energy) * on);
    mgraphics.set_line_width(5);
    mgraphics.stroke_preserve();
    mgraphics.set_source_rgba(TUBE[0], TUBE[1], TUBE[2], 0.25 + 0.75 * on);
    mgraphics.set_line_width(1.2);
    mgraphics.stroke();
}

// SHATTER: one thin tube in the sign's red, flickering with it
function drawShatterBtn(F) {
    var R = shatterRect(), hs = hoverShatter, on = F.on, g = on * (hs ? 1 : 0.68);
    if (spr.neGlow && spr.neTube) {
        var x = R[0] - SPAD / 2, y = R[1] - SPAD / 2;
        if (on < 1) blit(spr.neOff, x, y, 1 / S, 1);
        blit(spr.neGlow, x, y, 1 / S, g);
        blit(spr.neTube, x, y, 1 / S, on);
    } else {                            // no sprite: a stroked capsule
        roundRect(R[0] + 2, R[1] + 2, SHW - 4, SHH - 4, (SHH - 4) / 2);
        mgraphics.close_path();
        mgraphics.set_source_rgba(NEON[0], NEON[1], NEON[2], 0.3 * g);
        mgraphics.set_line_width(5);
        mgraphics.stroke_preserve();
        mgraphics.set_source_rgba(TUBE[0], TUBE[1], TUBE[2], 0.25 + 0.75 * on);
        mgraphics.set_line_width(1.5);
        mgraphics.stroke();
    }
    spaced("SHATTER", R[0] + R[2] / 2, R[1] + R[3] / 2 + 0.5, 9.5, hs ? WHITE : [1, 0.941, 0.902], hs ? 1 : 0.94, 2.4);
}

// The arrow and the glide text are neon marks: [ink, its alpha, glow strength] for a mark with
// something to show (lit) and under the pointer (hv). With no sprite the ink draws alone.
function markLook(lit, hv) {
    if (lit) return [hv ? WHITE : INK_LIT, 1, hv ? 1 : 0.68];
    return hv ? [INK_LIT, 0.85, 0.55] : [INK_OFF, 0.55, 0];
}
// BACK: a U-turn, a straight run into the head on the left and the line curling back under on
// the right; unlit with nothing to go back to, and then it never glows
function drawBack(F) {
    var cx = backX(), cy = HCY + 0.5, tx = cx - 5.8, ty = cy - 1.7, r = 3.3, ax = cx + 2.4, n;
    var live = hist.length > 0, L = markLook(live, live && hoverBack);
    blit(spr.bkGlow, cx - BK_CELL / 2, HCY - BK_CELL / 2, 1 / S, L[2]);
    lineCap("round");
    mgraphics.set_source_rgba(L[0][0], L[0][1], L[0][2], L[1]);
    mgraphics.set_line_width(1.5);
    mgraphics.move_to(tx, ty); mgraphics.line_to(ax, ty); mgraphics.arc(ax, ty + r, r, -Math.PI / 2, Math.PI / 2);
    mgraphics.line_to(cx - 2.4, ty + r * 2); mgraphics.stroke();
    for (n = -1; n <= 1; n += 2) {          // the barbs trail back from the tip
        mgraphics.move_to(tx, ty); mgraphics.line_to(tx + 3.3, ty + n * 3.3); mgraphics.stroke();
    }
    lineCap("butt");
}
// the PULSE LED: a ring of SHATTER's tube over its red glow when on (strokes, since Max draws no
// radial gradient), the unlit tube's grey when off. No text (Andrew, 10-11).
function ledX() { return backX() - 5.8 - SIDE - LED_R - 0.7; }      // the arrow's ink starts 5.8 left of its centre
function drawLed(F) {
    var x = ledX(), y = HCY + 0.5, G = [[14, 0.05], [10, 0.09], [7, 0.15], [4.5, 0.28], [2.6, 0.4]], g = hoverLed ? 1 : 0.68, i;
    if (pulseOn) {
        for (i = 0; i < G.length; i++) arcStroke(x, y, LED_R, 0, TAU, G[i][0], LED_GLOW, G[i][1] * g);
        arcStroke(x, y, LED_R, 0, TAU, 1.4, LED_TUBE, 1);
    } else arcStroke(x, y, LED_R, 0, TAU, 1.4, LED_OFF, hoverLed ? 0.6 : 0.38);
}
// GLIDE: the word over its setting, both from one left edge and in one ink; lit when a length
// is set. A click opens the lengths as a list, and the open list counts as the pointer on it.
function drawGlide(F) {
    var x = glideX(), L = markLook(glideSel > 0, hoverGlide || gmenu);
    blit(spr.glGlow[glideSel], x - GL_PAD, HCY - GL_CELL_H / 2, 1 / S, L[2]);
    spacedFrom("GLIDE", x, HCY - 5.5, 6.5, L[0], L[1], 1.3);
    spacedFrom(GLIDES[glideSel], x, HCY + 5, 8, L[0], L[1], 0.6);
}
// the glide lengths, in the bank list's look: no footer, a tick on the one in use. Its rows
// start on the glide text's own left edge.
function glistRect() {
    return { x: Math.min(glideX() - 10, W() - 8 - GLIST_W), y: LIST_Y, w: GLIST_W, h: GLIDES.length * GLIST_ROW + 2 };
}
function drawGlist(F) {
    if (!gmenu) return;
    var R = glistRect(), i;
    roundRect(R.x, R.y, R.w, R.h, 3); mgraphics.close_path();
    mgraphics.set_source_rgba(5 / 255, 6 / 255, 10 / 255, 1); mgraphics.fill();
    roundRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 3); mgraphics.close_path();
    mgraphics.set_source_rgba(1, 1, 1, 0.2); mgraphics.set_line_width(1); mgraphics.stroke();
    for (i = 0; i < GLIDES.length; i++) {
        var y = R.y + 1 + i * GLIST_ROW, my = y + GLIST_ROW / 2, mark = i === glideSel, hv = hoverGrow === i;
        if (hv) fillRect(R.x + 1, y, R.w - 2, GLIST_ROW, WHITE, 0.09);
        spacedFrom(GLIDES[i], R.x + 10, my + 0.5, 8.5, mark || hv ? WHITE : [190 / 255, 197 / 255, 210 / 255], mark || hv ? 1 : 0.85, 1.2);
        if (mark) {
            var tx = R.x + R.w - 11;
            lineCap("round");
            mgraphics.set_source_rgba(1, 214 / 255, 198 / 255, 1); mgraphics.set_line_width(1.4);
            mgraphics.move_to(tx - 3.5, my); mgraphics.line_to(tx - 1, my + 2.6); mgraphics.line_to(tx + 3.5, my - 3); mgraphics.stroke();
            lineCap("butt");
        }
    }
}

// slots: a preset's name over a line of its colour; the caret at the end of the line opens the bank
var REST = [0.667, 0.698, 0.761];
function drawSlots(F) {
    for (var p = 0; p < slotRef.length; p++) {
        var P = slotRef[p], on = (P === loaded), hov = (p === hoverPreset), hn = hov && hoverZone === "name";
        var open = !!menu && menu.slot === p;
        var cx = pillX(p, F.w) + PILL_W / 2, ly = PILL_Y + PILL_H * 0.8, ac = P.accent;
        if (!(edit && edit.slot === p)) {       // the text box covers the name while it is typed
            fitName(P.name, cx, PILL_Y + PILL_H * 0.42, PILL_W - 6,
                    on ? WHITE : hn ? [0.910, 0.925, 0.961] : REST, on ? 1 : hn ? 0.95 : 0.72);
        }
        lineCap("round");
        if (on) { hline(cx - 15, cx + 15, ly, ac, 0.16, 5); hline(cx - 15, cx + 15, ly, ac, 0.3, 3.4); }
        hline(cx - 15, cx + 15, ly, ac, on ? 1 : hov ? 0.8 : 0.45, on ? 1.8 : 1.2);
        lineCap("butt");
        if (hov || open) {                      // the caret flips while its list is open
            var ax = cx + 24, d = open ? -1 : 1, hot = open || (hov && hoverZone === "caret");
            mgraphics.set_source_rgba(hot ? 1 : REST[0], hot ? 1 : REST[1], hot ? 1 : REST[2], hot ? 1 : 0.75);
            mgraphics.move_to(ax - 3.2, ly - 1.6 * d); mgraphics.line_to(ax + 3.2, ly - 1.6 * d); mgraphics.line_to(ax, ly + 2.2 * d);
            mgraphics.close_path(); mgraphics.fill();
        }
    }
}

// the bank, drawn inside the face; it covers the knobs while open
function listRect() {
    var w = W(), rows = Math.min(bank.length, LIST_MAX);
    return { x: Math.min(pillX(menu.slot, w), w - 8 - LIST_W), y: LIST_Y, w: LIST_W, rows: rows, h: rows * LIST_ROW + LIST_FOOT + 2 };
}
function maxScroll() { return Math.max(0, bank.length - LIST_MAX); }
// SAVE NEW, RENAME, DELETE: the last two act on the preset the slot holds, and stay dim on a stock one
function footLive(k, cur) { return k === 0 ? !!plate : k === 1 ? !cur.stock && !!nameBox() : !cur.stock; }
var FOOT = ["SAVE NEW", "RENAME", "DELETE"];
function drawList(F) {
    if (!menu) return;
    var R = listRect(), cur = slotRef[menu.slot], n = bank.length, scrolls = n > R.rows, v, k;
    roundRect(R.x, R.y, R.w, R.h, 3); mgraphics.close_path();
    mgraphics.set_source_rgba(5 / 255, 6 / 255, 10 / 255, 1); mgraphics.fill();
    roundRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 3); mgraphics.close_path();
    mgraphics.set_source_rgba(1, 1, 1, 0.2); mgraphics.set_line_width(1); mgraphics.stroke();
    for (v = 0; v < R.rows; v++) {
        var i = menu.scroll + v, P = bank[i], y = R.y + 1 + v * LIST_ROW, my = y + LIST_ROW / 2, mark = P === cur, hv = hoverRow === i;
        if (mark && menu.arm) fillRect(R.x + 1, y, R.w - 2, LIST_ROW, [1, 60 / 255, 40 / 255], 0.22);   // the one about to go
        else if (hv) fillRect(R.x + 1, y, R.w - 2, LIST_ROW, WHITE, 0.09);
        disc(mgraphics, R.x + 11, my, 2.4, P.accent, 1);
        spacedFrom(P.name, R.x + 21, my + 0.5, 9.5, mark || hv ? WHITE : [190 / 255, 197 / 255, 210 / 255], mark || hv ? 1 : 0.85, 1.4);
        if (mark) {                             // the one this slot holds
            var tx = R.x + R.w - (scrolls ? 21 : 14), tc = mix(P.accent, WHITE, 0.35);
            lineCap("round");
            mgraphics.set_source_rgba(tc[0], tc[1], tc[2], 1); mgraphics.set_line_width(1.4);
            mgraphics.move_to(tx - 3.5, my); mgraphics.line_to(tx - 1, my + 2.6); mgraphics.line_to(tx + 3.5, my - 3); mgraphics.stroke();
            lineCap("butt");
        }
    }
    var fy = R.y + 1 + R.rows * LIST_ROW;
    if (scrolls) {
        var th = R.rows * LIST_ROW - 4, bx = R.x + R.w - 6;
        fillRect(bx, R.y + 3, 2, th, WHITE, 0.08);
        fillRect(bx, R.y + 3 + th * menu.scroll / n, 2, th * R.rows / n, WHITE, 0.5);
    }
    fillRect(R.x + 1, fy, R.w - 2, 1, WHITE, 0.14);
    for (k = 0; k < 3; k++) {
        var live = footLive(k, cur), fh = live && hoverFoot === k, ask = k === 2 && menu.arm;   // DELETE asks once more
        spaced(ask ? "CONFIRM" : FOOT[k], R.x + R.w / 3 * (k + 0.5), fy + LIST_FOOT / 2 + 1, 8,
               !live ? REST : ask ? (fh ? [1, 183 / 255, 163 / 255] : [1, 103 / 255, 70 / 255]) : fh ? WHITE : [214 / 255, 220 / 255, 232 / 255],
               !live ? 0.26 : ask || fh ? 1 : 0.86, 1.2);
    }
}

// MIX: a hairline between it and the eight, then a knob with no colour of its own
function drawMix(F) {
    var f = knobFrac(MIX), cx = kx(MIX, F.w), xd = (kx(7, F.w) + cx) / 2;
    mgraphics.set_source_rgba(1, 1, 1, 0.16); mgraphics.set_line_width(1);
    mgraphics.move_to(xd, KY - 30); mgraphics.line_to(xd, LABEL_Y + 8); mgraphics.stroke();
    drawKnob({ k: MIXK, i: MIX, f: f, cx: cx, a: A0 + SWEEP * f, hot: hoverKnob === MIX, B: null, plain: true });
}

// q.plain: MIX, which has no burst: no glow at the arc's end and nothing caught on the cap
function drawKnob(q) {
    var k = q.k, f = q.f, cx = q.cx, a = q.a, hot = q.hot, p;
    var bc = q.B ? q.B.col : k.color;                       // the knob's burst colour on this plate
    var r = KR + 6.5, col = q.plain ? k.color : mix(k.color, WHITE, 0.1 + f * 0.25);

    // track, then the value arc over two soft underlays, and a lit end
    lineCap("round");
    arcStroke(cx, KY, r, A0, A0 + SWEEP, 1.4, WHITE, 0.13);
    if (f > 0.004) {
        var gl = hot ? 1.7 : 1;
        arcStroke(cx, KY, r, A0, a, 6, col, (q.plain ? 0.08 : 0.1) * gl);
        arcStroke(cx, KY, r, A0, a, 3.6, col, (q.plain ? 0.18 : 0.22) * gl);
        arcStroke(cx, KY, r, A0, a, 1.7, col, 1);
        var ex = cx + Math.cos(a) * r, ey = KY + Math.sin(a) * r;
        if (!q.plain) blit(endGlow[q.i], ex - END_R, ey - END_R, 1 / S, 1);
        disc(mgraphics, ex, ey, 2.3, WHITE, 1);
    }
    lineCap("butt");

    // flat cap: a shadow under it, a dark disc, one fine ring lit from above
    blit(shadowImg, cx - SHADOW_R, KY + 4 - SHADOW_R, 1 / S, 1);
    disc(mgraphics, cx, KY, KR, CAPFILL, 1);
    p = mgraphics.pattern_create_linear(0, KY - KR, 0, KY + KR);
    p.add_color_stop_rgba(0, 1, 1, 1, 0.4);
    p.add_color_stop_rgba(1, 1, 1, 1, 0.14);
    mgraphics.set_source(p); mgraphics.set_line_width(1);
    arcPath(mgraphics, cx, KY, KR - 0.6, 0, TAU); mgraphics.stroke();

    // the cap catches its burst: colour in the dish and around the edge, more as the knob comes up
    if (q.B && q.B.dish) blit(q.B.dish, cx - KR, KY - KR, 1 / S, (0.08 + 0.34 * f) / DISH_PEAK);
    var ec = q.plain ? bc : mix(bc, WHITE, 0.3);
    arcStroke(cx, KY, KR - 0.4, 0, TAU, 1, ec, 0.08 + (q.plain ? 0.3 : 0.5) * f);

    // the arc's colour caught along the cap's top edge, fading at both ends
    if (!q.plain) {
        var er = KR - 4.2;
        p = mgraphics.pattern_create_linear(cx - er * 0.8, 0, cx + er * 0.8, 0);
        p.add_color_stop_rgba(0, ec[0], ec[1], ec[2], 0);
        p.add_color_stop_rgba(0.5, ec[0], ec[1], ec[2], Math.min(1, 0.35 + 0.75 * f));
        p.add_color_stop_rgba(1, ec[0], ec[1], ec[2], 0);
        mgraphics.set_source(p); mgraphics.set_line_width(1.6);
        arcPath(mgraphics, cx, KY, er, Math.PI * 1.2, Math.PI * 1.8); mgraphics.stroke();
    }

    // pointer
    var pc = mix(WHITE, bc, 0.18 * f);
    lineCap("round");
    mgraphics.set_source_rgba(pc[0], pc[1], pc[2], 0.97);
    mgraphics.set_line_width(1.9);
    mgraphics.move_to(cx + Math.cos(a) * KR * 0.3, KY + Math.sin(a) * KR * 0.3);
    mgraphics.line_to(cx + Math.cos(a) * KR * 0.74, KY + Math.sin(a) * KR * 0.74);
    mgraphics.stroke();
    lineCap("butt");

    // the name, or the percent while the knob is under the cursor or in the hand
    // A held knob's name reads at full white over a line of its colour; the line shows faint
    // under the cursor, since a click on the name is what holds it.
    var hd = held[k.macro];
    if (hot) spaced(Math.round(f * 100) + "%", cx, LABEL_Y, 11, mix(k.color, WHITE, 0.2), 1, 0.4);
    else spaced(k.label, cx, LABEL_Y, 9, hd ? WHITE : mix(LBL_LO, LBL_HI, Math.min(1, f * 1.3)), hd ? 0.98 : 0.9, 1.7);
    if (hd || hoverHold === q.i) {
        lineCap("round");
        hline(cx - 10, cx + 10, LABEL_Y + 9, k.color, hd ? 1 : 0.45, 1.5);
        lineCap("butt");
    }
}

// ---- mouse ------------------------------------------------------------------
var drag = { knob: -1, lastY: 0 };
var barDrag = null;     // the list's scroll bar in the hand: { y, s0 }

// knob index under a point (within a forgiving radius), MIX last, or -1
function knobAt(x, y) {
    var w = W();
    for (var i = 0; i <= MIX; i++) {
        var dx = x - kx(i, w), dy = y - KY;
        if (Math.sqrt(dx * dx + dy * dy) <= KR + 12) return i;
    }
    return -1;
}

// slot index under a point, or -1
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

function ledAt(x, y) { return Math.abs(x - ledX()) < 8 && Math.abs(y - HCY) < 10; }
function backAt(x, y) { return Math.abs(x - backX()) <= BACK_W / 2 + 3 && Math.abs(y - HCY) < 12; }
function glideAt(x, y) { return x >= glideX() && x <= glideX() + GL_W && Math.abs(y - HCY) < 13; }
// the row of the open glide list under a point, or -1
function glistHit(x, y) {
    if (!gmenu) return -1;
    var R = glistRect();
    if (x < R.x || x > R.x + R.w || y < R.y || y > R.y + R.h) return -1;
    return Math.max(0, Math.min(GLIDES.length - 1, Math.floor((y - R.y - 1) / GLIST_ROW)));
}
// the knob whose label is under a point, or -1: a click there holds the knob out of SHATTER
function holdAt(x, y) {
    if (y <= LABEL_Y - 8 || y >= LABEL_Y + 13) return -1;
    for (var i = 0, w = W(); i < KNOBS.length; i++) if (Math.abs(x - kx(i, w)) < 30) return i;
    return -1;
}

// the caret's part of a slot: the right end, level with the colour line
function caretAt(p, x, y) { return x >= pillX(p, W()) + PILL_W / 2 + 12 && y >= PILL_Y + 12; }
// what of the open list is under a point: null off it, else a row, a footer button or the scroll bar
function listHit(x, y) {
    if (!menu) return null;
    var R = listRect();
    if (x < R.x || x > R.x + R.w || y < R.y || y > R.y + R.h) return null;
    var ry = y - R.y - 1;
    if (ry >= R.rows * LIST_ROW) return { foot: Math.min(2, Math.floor((x - R.x) / (R.w / 3))) };
    if (bank.length > R.rows && x > R.x + R.w - 10) return { bar: true };
    return { row: menu.scroll + Math.max(0, Math.floor(ry / LIST_ROW)) };
}
function openList(s) {
    syncBank(); gmenu = false;
    menu = { slot: s, scroll: Math.max(0, Math.min(maxScroll(), bank.indexOf(slotRef[s]) - 2)), arm: false };
    mgraphics.redraw();
}
function listClick(h, y) {
    var s = menu.slot, armed = menu.arm, P;
    menu.arm = false;                           // any other click calls a pending delete off
    if (h.bar) { barDrag = { y: y, s0: menu.scroll }; return; }
    if (h.row !== undefined) {                  // picking a row puts that preset in the slot and loads it
        P = bank[h.row]; syncBank(); P = same(P);
        menu = null;
        if (P) { slotRef[s] = P; loadPreset(P); keepSlots(); }
        return;
    }
    if (!footLive(h.foot, slotRef[s])) return;
    P = slotRef[s];
    if (h.foot === 0) {                         // SAVE NEW: the current knobs and glass, into this slot
        syncBank();
        P = saveNew(); slotRef[s] = P; saveBank();
        menu = null;
        openEdit(P, s);
    } else if (h.foot === 1) openEdit(P, s);
    else if (!armed) menu.arm = true;           // DELETE turns to CONFIRM
    else {
        syncBank(); P = same(P);
        if (P) { removePreset(P); saveBank(); }
        menu.scroll = Math.min(menu.scroll, maxScroll());
    }
}

function onclick(x, y) {
    leaveEdit();                // a click anywhere on the face keeps the name being typed
    drag.knob = -1; barDrag = null;   // no pending knob-drag, so a stray ondrag can't fight what follows
    if (menu) {
        var h = listHit(x, y);
        if (h) { listClick(h, y); mgraphics.redraw(); return; }
        var s = menu.slot;      // a click off the list closes it, and then counts as a click
        menu = null; mgraphics.redraw();
        if (presetAt(x, y) === s && caretAt(s, x, y)) return;   // the caret closes its own list
    }
    if (gmenu) {                // a row picks its length; a click off the list closes it, and then counts as a click
        var gr = glistHit(x, y);
        gmenu = false; hoverGrow = -1; mgraphics.redraw();
        if (gr >= 0) { glide(gr); return; }
        if (glideAt(x, y)) return;      // the glide word closes its own list
    }
    if (shatterAt(x, y)) { doShatter(); return; }
    if (ledAt(x, y)) { pulse(); return; }
    if (backAt(x, y)) { goBack(); return; }
    if (glideAt(x, y)) { gmenu = true; mgraphics.redraw(); return; }
    var hh = holdAt(x, y);
    if (hh >= 0) { hold(hh); return; }
    var hp = presetAt(x, y);
    if (hp >= 0) {
        if (caretAt(hp, x, y)) openList(hp);
        else loadPreset(slotRef[hp]);
        return;
    }
    // knobs?
    var hit = knobAt(x, y);
    if (hit >= 0) {
        drag.knob = hit; drag.lastY = y;
        if (anim) anim.free[knobOf(hit).macro] = true;  // a grabbed knob leaves the glide
        hoverKnob = hit; mgraphics.redraw();   // the grabbed knob shows its percent for the drag
    }
}
onclick.local = 1;

function ondrag(x, y, button, cmd, shift) {
    if (barDrag && menu) {      // six rows show; the bar's travel is the rest of the bank
        if (!button) { barDrag = null; return; }
        var per = Math.min(bank.length, LIST_MAX) * LIST_ROW / bank.length;   // face pixels of bar travel per row
        menu.scroll = Math.max(0, Math.min(maxScroll(), Math.round(barDrag.s0 + (y - barDrag.y) / per)));
        mgraphics.redraw();
        return;
    }
    if (drag.knob < 0) return;
    if (drag.knob !== MIX) loaded = null;   // a manual knob move means we're no longer on a preset; MIX belongs to none
    var k = knobOf(drag.knob), range = pmax[k.macro] - pmin[k.macro];
    var dv = (drag.lastY - y) / (shift ? 1500 : 150) * range;   // 150px = full travel, ten times that with Shift; up = increase
    drag.lastY = y;
    setMacro(k.macro, vals[k.macro] + dv);
}
ondrag.local = 1;

function ondblclick(x, y) {
    var hit = knobAt(x, y);
    if (hit >= 0) {
        var k = knobOf(hit);
        if (anim) anim.free[k.macro] = true;
        setMacro(k.macro, hit === MIX ? pmax[MIX] : (pmin[k.macro] + pmax[k.macro]) / 2);  // reset to center; MIX to all wet
    }
}
ondblclick.local = 1;

// hover: track what is under the cursor; a repaint only when it changes. An open list covers
// the knobs, so nothing under it shows as hovered.
function onidle(x, y) {
    var h = listHit(x, y), hk = -1, hp = -1, hz = "", hsh = false, hr = -1, hf = -1, hb = false, hg = false, hh = -1, hl = false, hgr = glistHit(x, y);
    if (h) { if (h.row !== undefined) hr = h.row; if (h.foot !== undefined) hf = h.foot; }
    else if (hgr < 0) {
        hk = knobAt(x, y); hp = presetAt(x, y); hz = hp < 0 ? "" : caretAt(hp, x, y) ? "caret" : "name"; hsh = shatterAt(x, y);
        hb = backAt(x, y); hg = glideAt(x, y); hh = holdAt(x, y); hl = ledAt(x, y);
    }
    if (hk !== hoverKnob || hp !== hoverPreset || hz !== hoverZone || hsh !== hoverShatter || hr !== hoverRow || hf !== hoverFoot
            || hb !== hoverBack || hg !== hoverGlide || hh !== hoverHold || hgr !== hoverGrow || hl !== hoverLed) {
        hoverKnob = hk; hoverPreset = hp; hoverZone = hz; hoverShatter = hsh; hoverRow = hr; hoverFoot = hf;
        hoverBack = hb; hoverGlide = hg; hoverHold = hh; hoverGrow = hgr; hoverLed = hl; mgraphics.redraw();
    }
}
onidle.local = 1;

function onidleout(x, y) {
    hoverKnob = -1;
    hoverPreset = -1; hoverZone = "";
    hoverShatter = false;
    hoverRow = -1; hoverFoot = -1;
    hoverBack = false; hoverGlide = false; hoverHold = -1; hoverGrow = -1; hoverLed = false;
    mgraphics.redraw();
}
onidleout.local = 1;

// ---- lifecycle --------------------------------------------------------------
function onresize() { regenTask.schedule(120); mgraphics.redraw(); }
onresize.local = 1;

// the user's bank, if one has been saved
try { syncBank(); } catch (e) { post_("EXC bank: " + e.message); }

// the plate a fresh device opens on
try { pickPlate(); } catch (e) { post_("EXC first plate: " + e.message); }

// the patcher may not hold the text box yet while this script loads
var boxTask = new Task(function () {
    if (nameBox()) hideBox();
    makeTap();
    post_("level tap " + tapState);
    post_("bank: " + (bank.length - PRESETS.length) + " saved, file " + (onDisk ? "read" : "not there yet") + ", name box " + (tb ? (boxMade ? "made" : "found") : "not in this device"));
});
boxTask.schedule(400);

// LOM may not be ready at script load; resolve shortly after.
var bootTask = new Task(initLOM);
bootTask.schedule(300);
