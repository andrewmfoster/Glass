// =============================================================================
// PAD TEST 2, 2026-10-10. Not a script of its own: this block is appended to glass.jsui.js for
// one round in Live and never ships. The repo's glass.jsui.js stays the release script.
//
// Test 1 (commit fc682e2) laid two see-through live.text buttons over the face, made by the
// script. Measured in Live 12.4.6, the device open in the Max editor: both were made with
// nothing refused and drew nothing, Live's MIDI map mode tinted both, and neither could be
// picked there (Andrew: no marker, no row), the one taking the mouse included. A stock
// control took the same key at once. The @_parameter_longname arguments were ignored (the
// names stayed live.text and live.text[1]) and both sent an unchanged 0 on their own once.
//
// Test 2: SHATTER as the rack's tenth macro, which is Live's own control and maps like any
// other. The script watches its value and fires SHATTER when it crosses the middle, in either
// direction, so a pad (which Live flips between the ends, not measured yet), a knob or
// automation all work. It also takes test 1's four objects out of the open device.
// Every [GLASS] line also lands in a log file this seat can read.
// =============================================================================
BUILD = "v5.14 pad test 2";
var PT_PATHS = ["/tmp/glass-pad-test.log", "~/Documents/GLASS pad test.log"], ptPath = -1;
var ptLines = [], ptT0 = now();
// replaces the script's post_ (a later declaration wins); the guards cover lines posted while
// the script above is still loading, before this block has run
function post_(s) {
    post("[GLASS] " + s + "\n");
    if (!ptLines) return;
    ptLines.push((now() - ptT0) + " ms  " + s);
    ptFlush.schedule(400);
}
var ptFlush = new Task(function () {
    var text = ptLines.join("\n") + "\n", i;
    try {
        if (ptPath < 0) {               // the first path that reads back what was written
            for (i = 0; i < PT_PATHS.length && ptPath < 0; i++) {
                writeText(PT_PATHS[i], text);
                if (readText(PT_PATHS[i]) === text) ptPath = i;
            }
            if (ptPath < 0) { post("[GLASS] pad test: no log file could be written\n"); ptPath = 99; }
        } else if (ptPath < PT_PATHS.length) writeText(PT_PATHS[ptPath], text);
    } catch (e) { post("[GLASS] pad test: log write failed (" + e.message + ")\n"); }
});

// test 1's objects, by the names it gave them; a stray "pad a 0" from one still there is logged
function ptClean() {
    var names = ["glasspad_a", "glasspad_a_in", "glasspad_b", "glasspad_b_in"], out = [], i, o;
    for (i = 0; i < names.length; i++) {
        try { o = me.patcher.getnamed(names[i]); if (o) { me.patcher.remove(o); out.push(names[i] + " removed"); } else out.push(names[i] + " not there"); }
        catch (e) { out.push(names[i] + " EXC " + e.message); }
    }
    post_("pad test 1 cleanup: " + out.join(", "));
}
function pad(key, v) { post_("stray message from a test 1 button: pad " + key + " " + v + " (not acted on)"); }

// ---- the part that would ship: the rack's tenth macro as SHATTER's pad --------
var PADM = 9;               // macro index, MIX is 8
var padApi = null, padMid = 63.5, padSide = null, padTries = 0;
// an observer may not change Live from inside its own call, so the SHATTER is put off a tick
var padFire = new Task(function () { doShatter(); });
function onPad(args) {
    if (!args || args[0] !== "value") return;
    var v = parseFloat(args[1]);
    if (isNaN(v)) return;
    var side = v > padMid;
    if (padSide === null) { padSide = side; post_("pad macro: starts at " + v); return; }
    if (side === padSide) { post_("pad macro: " + v + " (same side, nothing)"); return; }
    padSide = side;
    post_("pad macro: " + v + " crossed the middle -> SHATTER");
    padFire.schedule(1);
}
function bindPad() {
    try {
        if (padApi) { try { padApi.property = ""; } catch (e0) {} padApi = null; }
        if (!ready || !rackPath) { if (padTries++ < 15) padTask.schedule(300); else post_("pad macro: the rack never bound, nothing watched"); return; }
        var rack = new LiveAPI(null, rackPath), plist = rack.get("parameters"), pid = plist[(PADM + 1) * 2 + 1], shown = "?";
        try { shown = rack.get("visible_macro_count"); } catch (e1) { shown = "EXC " + e1.message; }
        if (pid === undefined) { post_("pad macro: the rack has no tenth macro (macros showing: " + shown + ")"); return; }
        padSide = null;
        padApi = new LiveAPI(onPad, "id " + pid);
        var lo = parseFloat(padApi.get("min")), hi = parseFloat(padApi.get("max")), nm = padApi.get("name"), v = parseFloat(padApi.get("value"));
        if (!isNaN(lo) && !isNaN(hi)) padMid = (lo + hi) / 2;
        padApi.property = "value";      // calls onPad once with the value as it stands
        if (padSide === null && !isNaN(v)) padSide = v > padMid;
        post_("pad macro: watching the tenth macro, named " + nm + ", value " + v + ", range " + lo + " to " + hi + ", macros showing in the rack: " + shown);
    } catch (e) { post_("EXC pad macro: " + e.message); }
}
var padTask = new Task(bindPad);
var ptTask = new Task(function () {
    post_("pad test 2: build " + BUILD);
    ptClean();
    bindPad();
});
ptTask.schedule(900);
