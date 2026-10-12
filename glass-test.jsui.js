// glass-test.jsui.js — throwaway probe for the GLASS face rebuild (not the device)
// =============================================================================
// Answers, in Live's device view, the questions the new face depends on:
//   1. can jsui load a PNG and draw it scaled (wordmark + shard sprites)?
//   2. can it draw an image with alpha (field brightness follows the knobs)?
//   3. can it stroke with gradients (rays that fade out)?
//   4. can it render a few thousand strokes ONCE into an offscreen image and
//      blit that per paint (the random field, regenerated only on SHATTER)?
// Added 10-10 for the Blackout face, which draws things the shipped device never has:
//   5. can it fill with a radial gradient, offscreen (a burst's bloom) and live
//      (the cap's dish, a circle that is not centred on its gradient)?
//   6. can it draw an image turned, scaled and faded at once (each knob's burst)?
//   7. can it stroke a three-stop gradient live, 80 times a paint (thrown fractures)?
// No LiveAPI, touches nothing in the set. Every result posts to the Max console
// as a [GLASS-TEST] line; paste them back.
//   click  = regenerate the field, the burst and the fractures
//   drag   = left/right sets field brightness, and turns, grows and lights the bursts
// RUN 2026-10-10 in Live 12's Max 9.1.5 editor: every check posted OK. Sprites load off the
// search path, ~4000 gradient strokes render offscreen in 60 to 130 ms, mgraphics.clip is
// undefined. The one paint time posted (9 ms) was taken at the default 64x64 box, so paint
// time at face size is still unmeasured, and the by-eye checks are not yet confirmed.
// =============================================================================

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var S = 2;                      // offscreen field is rendered at 2x for retina
var seen = {};
function note(name, ok, msg) {  // one console line per test, first result wins
    if (seen[name]) return;
    seen[name] = true;
    post("[GLASS-TEST] " + name + ": " + (ok ? "OK" : "FAIL") + (msg ? "  " + msg : "") + "\n");
}

function W() { return box.rect[2] - box.rect[0]; }
function H() { return box.rect[3] - box.rect[1]; }

// ---- 1. image load ----------------------------------------------------------
function loadImg(name, file) {
    try {
        var im = new Image(file);
        var sz = im.size;
        if (!sz || !sz[0]) throw new Error("empty size (file not on the Max search path?)");
        note("load " + name, true, sz[0] + "x" + sz[1]);
        return im;
    } catch (e) { note("load " + name, false, String(e)); return null; }
}
var wordmark = loadImg("wordmark", "glass-wordmark.png");
var shard = loadImg("shard", "glass-shard.png");

// ---- helpers ----------------------------------------------------------------
function hsl(h, s, l) {
    h = ((h % 1) + 1) % 1;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

var gradOK = null;              // null = untried, then true/false
// a line from (x0,y0) to (x1,y1) fading from alpha a to 0; solid fallback if gradients fail
function ray(mg, x0, y0, x1, y1, c, a, lw) {
    mg.set_line_width(lw);
    if (gradOK !== false) {
        try {
            var p = mg.pattern_create_linear(x0, y0, x1, y1);
            p.add_color_stop_rgba(0, c[0], c[1], c[2], a);
            p.add_color_stop_rgba(1, c[0], c[1], c[2], 0);
            mg.set_source(p);
            if (gradOK === null) { gradOK = true; note("gradient strokes", true); }
        } catch (e) { gradOK = false; note("gradient strokes", false, String(e)); }
    }
    if (gradOK === false) mg.set_source_rgba(c[0], c[1], c[2], a * 0.45);
    mg.move_to(x0, y0); mg.line_to(x1, y1); mg.stroke();
}

// ---- 4. offscreen field -----------------------------------------------------
var field = null, genMs = -1, strokes = 0;
function genField() {
    var w = Math.round(W() * S), h = Math.round(H() * S), t0 = new Date().getTime();
    strokes = 0;
    try {
        var mg = new MGraphics(w, h);
        mg.set_source_rgba(0.008, 0.012, 0.035, 1);
        mg.rectangle(0, 0, w, h); mg.fill();

        var base = Math.random(), offs = [0, 0.08, 0.42, 0.51, 0.6, 0.89], pal = [];
        for (var i = 0; i < offs.length; i++) pal.push(hsl(base + offs[i], 1, 0.6));
        function pick() { return pal[Math.floor(Math.random() * pal.length)]; }

        for (var s = 0; s < 90; s++) {                       // long streaks
            var x = Math.random() * w * 1.4 - w * 0.2, y = Math.random() * h * 1.6 - h * 0.3;
            var a = Math.random() * Math.PI, len = 300 + Math.random() * 900, c = pick();
            mg.set_source_rgba(c[0], c[1], c[2], 0.06 + Math.random() * 0.2);
            mg.set_line_width(0.5 + Math.random() * 0.8);
            mg.move_to(x - Math.cos(a) * len, y - Math.sin(a) * len);
            mg.line_to(x + Math.cos(a) * len, y + Math.sin(a) * len); mg.stroke(); strokes++;
        }
        var nB = 24;
        for (var b = 0; b < nB; b++) {                       // bursts of crack rays
            var bx = (b + Math.random()) / nB * w, by = Math.random() * h;
            var sc = 0.35 + Math.random() * Math.random() * 1.3, bc = pick();
            var rays = 40 + Math.floor(Math.random() * 80);
            for (var k = 0; k < rays; k++) {
                var ang = Math.random() * Math.PI * 2, L = (30 + Math.random() * Math.random() * 520) * sc;
                var col = Math.random() < 0.25 ? pick() : bc, lw = 0.5 + Math.random() * 1.2;
                var ex = bx + Math.cos(ang) * L, ey = by + Math.sin(ang) * L;
                ray(mg, bx, by, ex, ey, col, 0.16, lw * 5);  // wide faint underlay stands in for bloom
                ray(mg, bx, by, ex, ey, col, 0.62, lw);
                strokes += 2;
            }
        }
        field = new Image(mg);
        genMs = new Date().getTime() - t0;
        var sz = field.size;
        note("offscreen MGraphics -> Image", !!(sz && sz[0]), sz ? sz[0] + "x" + sz[1] : "no size");
        post("[GLASS-TEST] field generated: " + strokes + " strokes in " + genMs + " ms\n");
    } catch (e) {
        field = null;
        note("offscreen MGraphics -> Image", false, String(e));
    }
}

// ---- 2. scaled + alpha image draw -------------------------------------------
var alphaOK = null;
function drawImg(name, im, x, y, sc, a) {
    if (!im) return;
    mgraphics.save();
    try {
        mgraphics.translate(x, y); mgraphics.scale(sc, sc);
        if (a < 1 && alphaOK !== false) {
            try {
                mgraphics.set_source_surface(im, 0, 0); mgraphics.paint_with_alpha(a);
                if (alphaOK === null) { alphaOK = true; note("image alpha (set_source_surface + paint_with_alpha)", true, "ran without error; confirm by eye that drag dims the field"); }
            } catch (e) {
                alphaOK = false; note("image alpha (set_source_surface + paint_with_alpha)", false, String(e));
                mgraphics.image_surface_draw(im);
            }
        } else {
            mgraphics.image_surface_draw(im);
        }
        note("scaled draw " + name, true);
    } catch (e2) { note("scaled draw " + name, false, String(e2)); }
    mgraphics.restore();
}

// ---- 5. burst sprite: radial bloom + rays, rendered offscreen at 2x ------------
var BR = 96, burst = null, burstCol = [1, 1, 1], throwsGeo = [];
function genBurst() {
    burstCol = hsl(Math.random(), 1, 0.6);
    try {
        var d = BR * 2 * S, r = d / 2, c = burstCol, mg = new MGraphics(d, d);
        try {
            var p = mg.pattern_create_radial(r, r, 0, r, r, r);
            p.add_color_stop_rgba(0, c[0], c[1], c[2], 0.42);
            p.add_color_stop_rgba(0.22, c[0], c[1], c[2], 0.2);
            p.add_color_stop_rgba(0.55, c[0], c[1], c[2], 0.06);
            p.add_color_stop_rgba(1, c[0], c[1], c[2], 0);
            mg.set_source(p);
            mg.arc(r, r, r, 0, Math.PI * 2); mg.fill();
            note("radial gradient fill (offscreen)", true, "ran without error; confirm by eye that each burst has a soft bloom and no dark square around it");
        } catch (e) { note("radial gradient fill (offscreen)", false, String(e)); }
        for (var k = 0; k < 150; k++) {
            var ang = Math.random() * Math.PI * 2, L = (22 + Math.random() * Math.random() * 72) * S;
            ray(mg, r, r, r + Math.cos(ang) * L, r + Math.sin(ang) * L, c, 0.85, (0.25 + Math.random() * 0.5) * S);
        }
        burst = new Image(mg);
        var sz = burst.size;
        note("burst sprite", !!(sz && sz[0]), sz ? sz[0] + "x" + sz[1] : "no size");
    } catch (e2) { burst = null; note("burst sprite", false, String(e2)); }

    throwsGeo = [];                                          // 10 fractures a knob, fixed until the next click
    for (var i = 0; i < 80; i++) throwsGeo.push({
        a: Math.random() * Math.PI, l0: 50 + Math.random() * Math.random() * 330, l1: 50 + Math.random() * Math.random() * 330,
        lw: 0.3 + Math.random() * 0.5, k: 0.45 + Math.random() * 0.55
    });
}

// ---- 6. image turned + scaled + faded ---------------------------------------
var turnOK = null;
function drawTurned(im, cx, cy, d, ang, a) {    // im centred on (cx,cy), d wide, turned by ang
    if (!im || turnOK === false) return;
    mgraphics.save();
    try {
        var sz = im.size, sc = d / sz[0];
        mgraphics.translate(cx, cy); mgraphics.rotate(ang); mgraphics.scale(sc, sc);
        mgraphics.set_source_surface(im, -sz[0] / 2, -sz[1] / 2); mgraphics.paint_with_alpha(a);
        if (turnOK === null) { turnOK = true; note("image turned + scaled + alpha", true, "ran without error; confirm by eye that drag turns, grows and lights the bursts"); }
    } catch (e) { turnOK = false; note("image turned + scaled + alpha", false, String(e)); }
    mgraphics.restore();
}

// ---- 7. live three-stop gradient stroke -------------------------------------
var throwOK = null;
function fracture(x0, y0, x1, y1, mid, c, a, lw) {   // alpha 0, up to a at mid, back to 0
    if (throwOK === false) return;
    try {
        var p = mgraphics.pattern_create_linear(x0, y0, x1, y1);
        p.add_color_stop_rgba(0, c[0], c[1], c[2], 0);
        p.add_color_stop_rgba(mid, c[0], c[1], c[2], a);
        p.add_color_stop_rgba(1, c[0], c[1], c[2], 0);
        mgraphics.set_source(p); mgraphics.set_line_width(lw);
        mgraphics.move_to(x0, y0); mgraphics.line_to(x1, y1); mgraphics.stroke();
        if (throwOK === null) { throwOK = true; note("three-stop gradient stroke (live)", true); }
    } catch (e) { throwOK = false; note("three-stop gradient stroke (live)", false, String(e)); }
}

var dishOK = null;
function dish(cx, cy, r, c, a) {                // the cap's dish: a circle lit from below its centre
    if (dishOK === false) return;
    try {
        var p = mgraphics.pattern_create_radial(cx, cy + r * 0.55, 0, cx, cy + r * 0.55, r * 1.25);
        p.add_color_stop_rgba(0, c[0], c[1], c[2], a);
        p.add_color_stop_rgba(1, c[0], c[1], c[2], 0);
        mgraphics.set_source_rgba(0.04, 0.045, 0.06, 1);
        mgraphics.arc(cx, cy, r, 0, Math.PI * 2); mgraphics.fill();
        mgraphics.set_source(p);
        mgraphics.arc(cx, cy, r, 0, Math.PI * 2); mgraphics.fill();
        if (dishOK === null) { dishOK = true; note("radial gradient fill (live, off-centre)", true, "ran without error; confirm by eye that each disc is lit from its lower half"); }
    } catch (e) { dishOK = false; note("radial gradient fill (live, off-centre)", false, String(e)); }
}

function drawKnobs(w, h) {                      // eight knob positions, laid out as on the face
    var ky = h * 0.62, i, cx, t;
    for (i = 0; i < throwsGeo.length; i++) {
        t = throwsGeo[i]; cx = 20 + (w - 40) / 8 * ((i % 8) + 0.5);
        var dx = Math.cos(t.a), dy = Math.sin(t.a), l0 = t.l0 * (0.35 + 0.65 * bright), l1 = t.l1 * (0.35 + 0.65 * bright);
        fracture(cx - dx * l0, ky - dy * l0, cx + dx * l1, ky + dy * l1, l0 / (l0 + l1), burstCol, t.k * Math.pow(bright, 1.4), t.lw);
    }
    for (i = 0; i < 8; i++) {
        cx = 20 + (w - 40) / 8 * (i + 0.5);
        drawTurned(burst, cx, ky, BR * 2 * (0.46 + 0.74 * bright), (i % 2 ? -1 : 1) * bright * 1.7, Math.min(1, Math.pow(bright, 0.75) * 1.08));
        dish(cx, ky, 18, burstCol, 0.08 + 0.34 * bright);
    }
}

// ---- paint ------------------------------------------------------------------
var bright = 0.6, paints = 0, paintMs = 0;
function paint() {
    var t0 = new Date().getTime(), w = W(), h = H();
    mgraphics.set_source_rgba(0.008, 0.012, 0.035, 1);
    mgraphics.rectangle(0, 0, w, h); mgraphics.fill();

    drawImg("field", field, 0, 0, 1 / S, 0.55 + 0.45 * bright);
    drawKnobs(w, h);
    // same placement as the mock: sprites are 2x, drawn at half size
    drawImg("wordmark", wordmark, 16 - 55, 30 - 76, 0.5, 1);
    drawImg("shard", shard, 300 - 14, 13 - 14, 0.5, 1);

    paintMs = new Date().getTime() - t0;
    paints++;
    if (paints === 3) {
        post("[GLASS-TEST] paint with cached field, 8 turned bursts, 80 live fractures: " + paintMs + " ms  (box " + w + "x" + h + ")\n");
        post("[GLASS-TEST] mgraphics.clip is a " + (typeof mgraphics.clip) + "  (for the record; the face is drawn without it)\n");
    }

    mgraphics.select_font_face("Arial");
    mgraphics.set_font_size(10);
    mgraphics.set_source_rgba(1, 1, 1, 0.8);
    mgraphics.move_to(10, h - 8);
    mgraphics.show_text("TEST  gen " + genMs + " ms / " + strokes + " strokes   paint " + paintMs + " ms   bright " + Math.round(bright * 100) + "%");
}

function onclick(x, y) { genField(); genBurst(); mgraphics.redraw(); }
function ondrag(x, y, but) {
    if (!but) return;
    bright = Math.max(0, Math.min(1, x / W()));
    mgraphics.redraw();
}
function bang() { genField(); genBurst(); mgraphics.redraw(); }
function onresize() { genField(); mgraphics.redraw(); }

genField();
genBurst();
mgraphics.redraw();
