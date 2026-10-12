// glass-preset-test.jsui.js — throwaway probe for the GLASS preset bank (not the device)
// =============================================================================
// Answers, in Live's device strip, what the preset bank depends on:
//   A. can the script write a file and read it back, and by which form of path
//      (so one bank file on disk can sit behind every Live set)?
//   B. can a Max text box lie over the face, and can the script move it, show it,
//      hide it and fill it (so a name is typed where the slot is)?
//   1. does a typed name come back to the script on Return?
//   2. does the "select" message put the cursor in the box without a click?
//   3. does Esc reach the script?
//   4. does the dialog object work, as the fallback for typing a name?
// Runs inside GlassPresetTest.amxd (built by a script, not tracked), which holds this
// jsui, a textedit named "namebox", a key object and a dialog object.
// No LiveAPI, touches nothing in the set. Every result posts to the Max console as a
// [GLASS-PT] line, is drawn on the face, and is written to /tmp/glass-preset-test.log
// when a write there works. Probe files are named glass-bank-probe*.json.
// =============================================================================

autowatch = 1;
inlets = 1;
outlets = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var me = this;
var LOG = [], logPath = "";
var ROWS = [
    { say: "Click this row. Then click in the box at the right, type a name, press Return.", res: "", ok: null },
    { say: "Click this row. Do NOT click the box. Type Z, press Return.", res: "", ok: null, bail: true },
    { say: "Click this row. Click in the box at the right, press Esc.", res: "", ok: null, bail: true },
    { say: "Click this row. A pop-up asks for a name. Type one, click OK.", res: "", ok: null }
];
var ROW_Y = 6, ROW_H = 30, ROW_W = 560, BAIL = [430, 124];   // BAIL: x and width of the NOTHING HAPPENED button
var BOX = [575, 0, 118, 17];                                 // text box: x, (y set per row), w, h
var step = -1;              // row being run, -1 when idle
var tb = null, tbTried = false;
var keysBox = [], keysObj = [];   // key codes heard from the text box's middle outlet / from the key object
var fileOK = 0, fileAll = 0, firstDir = "";
var seen = {};

function W() { return box.rect[2] - box.rect[0]; }
function H() { return box.rect[3] - box.rect[1]; }
function redraw() { try { mgraphics.redraw(); } catch (e) {} }

// ---- log --------------------------------------------------------------------
function writeFile(path, s) {
    var f = new File(path, "write", "TEXT");
    if (!f.isopen) throw new Error("did not open for write");
    try { f.eof = 0; } catch (e) {}
    f.writestring(s);
    var where = "";
    try { where = String(f.foldername); } catch (e2) {}
    f.close();
    return where;
}
function readFile(path) {
    var f = new File(path, "read");
    if (!f.isopen) throw new Error("did not open for read");
    var s = "", n = 0, end = f.eof;
    while (f.position < end && n++ < 400) {
        var chunk = f.readstring(800);
        if (!chunk) break;
        s += chunk;
    }
    f.close();
    return s;
}
function flush() {
    if (!logPath) return;
    try { writeFile(logPath, LOG.join("\n") + "\n"); } catch (e) {}
}
function note(name, ok, msg) {          // ok: true, false, or null for a plain fact
    var line = name + ":" + (ok === null ? "" : ok ? " OK" : " FAIL") + (msg ? "  " + msg : "");
    LOG.push(line);
    post("[GLASS-PT] " + line + "\n");
    flush();
    redraw();
}
function once(name, ok, msg) { if (!seen[name]) { seen[name] = true; note(name, ok, msg); } }
function fact(name, fn) {
    try { note(name, null, String(fn())); } catch (e) { note(name, false, String(e)); }
}

// ---- A. files ---------------------------------------------------------------
function sampleBank() {                 // the size and shape of a real bank: eight presets with their glass
    var bank = { version: 1, presets: [] };
    for (var i = 0; i < 8; i++) {
        var p = { name: "USER " + (i + 1), seed: 100000 + i * 7919, vals: [], pal: [] };
        for (var k = 0; k < 8; k++) p.vals.push(Math.round((i * 17 + k * 29) % 128 * 100) / 100);
        for (var c = 0; c < 6; c++) p.pal.push([(i * 40 + c * 30) % 256, (c * 50) % 256, 255 - c * 20]);
        bank.presets.push(p);
    }
    return bank;
}
function probe(label, dir) {
    var path = dir + "glass-bank-probe.json", body = JSON.stringify(sampleBank());
    fileAll++;
    try {
        var where = writeFile(path, body), back = readFile(path), same = back === body, parsed = false;
        try { parsed = JSON.parse(back).presets.length === 8; } catch (e) {}
        if (same) { fileOK++; if (!firstDir) firstDir = dir; }
        note("file " + label, same && parsed, (same ? body.length + " chars back the same" : "read back " + back.length + " of " + body.length + " chars")
            + (parsed ? "" : ", did not parse") + "  path " + path + (where ? "  folder as Max names it " + where : ""));
        return same;
    } catch (e2) { note("file " + label, false, e2 + "  path " + path); return false; }
}
function deviceDir() {
    var p = String(me.patcher.filepath), i = p.lastIndexOf("/");
    if (i < 0) throw new Error("no folder in " + p);
    return p.slice(0, i + 1);
}
function runFiles() {
    note("run", null, new Date().toString());
    fact("env max.version", function () { return max.version; });
    fact("env max.os", function () { return max.os + " " + max.osversion; });
    fact("env max.apppath", function () { return max.apppath; });
    fact("env patcher.filepath", function () { return me.patcher.filepath; });
    fact("env JSON, Dict, Folder", function () { return (typeof JSON) + ", " + (typeof Dict) + ", " + (typeof Folder); });
    // /tmp first: whichever form works carries the log from here on
    if (probe("in /tmp, plain path", "/tmp/")) logPath = "/tmp/glass-preset-test.log";
    else if (probe("in /tmp, volume path", "Macintosh HD:/tmp/")) logPath = "Macintosh HD:/tmp/glass-preset-test.log";
    flush();
    probe("in ~/Documents (tilde path)", "~/Documents/");
    probe("in the Max user folder", "~/Documents/Max 9/");
    probe("in the Ableton User Library", "~/Music/Ableton/User Library/");
    try { probe("beside the device file", deviceDir()); } catch (e) { fileAll++; note("file beside the device file", false, String(e)); }
    probe("in a folder that does not exist yet", "~/Documents/GLASS probe folder/");
    if (firstDir) {
        try {
            var path = firstDir + "glass-bank-probe-dict.json", d = new Dict("glasspt_out"), d2 = new Dict("glasspt_in");
            d.parse(JSON.stringify(sampleBank()));
            d.export_json(path);
            d2.import_json(path);
            note("dict export and import", String(d2.get("version")) === "1", "version read back as " + d2.get("version") + "  path " + path);
        } catch (e3) { note("dict export and import", false, String(e3)); }
    }
    note("files", fileOK > 0, fileOK + " of " + fileAll + " places wrote and read back");
}

// ---- B. the text box ---------------------------------------------------------
function norm(v) {
    if (v === true) return "1";
    if (v === false) return "0";
    if (v && v.length !== undefined && typeof v !== "string") { var o = []; for (var i = 0; i < v.length; i++) o.push(Math.round(Number(v[i]))); return o.join(" "); }
    return String(Math.round(Number(v)));
}
function readAttr(attr) {
    var out = [];
    try { out.push("getboxattr " + norm(tb.getboxattr(attr))); } catch (e) { out.push("getboxattr threw"); }
    try { out.push("getattr " + norm(tb.getattr(attr))); } catch (e2) { out.push("getattr threw"); }
    if (attr === "hidden") { try { out.push("property " + norm(tb.hidden)); } catch (e3) { out.push("property threw"); } }
    return out.join(", ");
}
var WAYS = [
    ["setboxattr", function (attr, v) { tb.setboxattr(attr, v.length === 1 ? v[0] : v); }],
    ["message to the box", function (attr, v) { if (v.length === 1) tb.message(attr, v[0]); else tb.message(attr, v[0], v[1], v[2], v[3]); }],
    ["script sendbox", function (attr, v) {
        if (v.length === 1) me.patcher.message("script", "sendbox", "namebox", attr, v[0]);
        else me.patcher.message("script", "sendbox", "namebox", attr, v[0], v[1], v[2], v[3]);
    }],
    ["property", function (attr, v) { if (attr !== "hidden") throw new Error("hidden only"); tb.hidden = !!v[0]; }]
];
// Sets a box attribute every way there is. The first time, each way sets a wrong value and then
// the right one, and the read-back after each says which ways took.
function setBoxAttr(attr, wrong, right) {
    var report = !seen["ways " + attr];
    seen["ways " + attr] = true;
    for (var i = 0; i < WAYS.length; i++) {
        if (attr !== "hidden" && WAYS[i][0] === "property") continue;
        try {
            if (report) {
                WAYS[i][1](attr, wrong); var a = readAttr(attr);
                WAYS[i][1](attr, right); var b = readAttr(attr);
                note("box " + attr + " by " + WAYS[i][0], null, "wrote " + wrong.join(" ") + " read (" + a + ")  wrote " + right.join(" ") + " read (" + b + ")");
            } else WAYS[i][1](attr, right);
        } catch (e) { if (report) note("box " + attr + " by " + WAYS[i][0], false, String(e)); }
    }
}
function findBox() {
    if (tb) return;
    try { tb = me.patcher.getnamed("namebox"); } catch (e) { tb = null; if (!tbTried) note("text box found", false, String(e)); tbTried = true; return; }
    if (!tb) { if (!tbTried) note("text box found", false, "getnamed gave nothing"); tbTried = true; return; }
    note("text box found", true, "class " + tb.maxclass);
    fact("text box attributes", function () { return tb.getattrnames().join(" "); });
    setBoxAttr("hidden", [0], [1]);
}
function showBox(row, focus) {
    findBox();
    if (!tb) return;
    var y = ROW_Y + row * ROW_H + 5;
    setBoxAttr("presentation_rect", [BOX[0] - 60, y + 40, BOX[2], BOX[3]], [BOX[0], y, BOX[2], BOX[3]]);
    setBoxAttr("hidden", [1], [0]);
    try { tb.message("set", "USER 1"); once("box filled by set", true, "text now reads (" + readText() + ")"); } catch (e) { once("box filled by set", false, String(e)); }
    if (focus) { try { tb.message("select"); once("select sent", true); } catch (e2) { once("select sent", false, String(e2)); } }
}
function readText() { try { return String(tb.getattr("text")); } catch (e) { return "getattr text threw"; } }
function hideBox() { if (tb) setBoxAttr("hidden", [0], [1]); }

// ---- the four rows -----------------------------------------------------------
function finish(row, ok, res) {
    ROWS[row].ok = ok; ROWS[row].res = res;
    note("row " + (row + 1), ok, res + "  keys from the box (" + keysBox.join(",") + ")  keys from the key object (" + keysObj.join(",") + ")");
    keysBox = []; keysObj = [];
    hideBox();
    step = -1;
    redraw();
}
function start(row) {
    step = row; keysBox = []; keysObj = [];
    ROWS[row].ok = null; ROWS[row].res = "waiting for you";
    note("row " + (row + 1) + " started", null);
    if (row === 3) outlet(0, "dlg", "symbol", "USER 1");
    else showBox(row, row === 1);
    redraw();
}
function anything() {
    var a = arrayfromargs(arguments), m = messagename;
    if (m === "te1") {                  // a key typed into the text box
        keysBox.push(a[0]);
        if (a[0] === 27 && step === 2) finish(2, true, "Esc reached the script");
        return;
    }
    if (m === "key") { if (keysObj.length < 40) keysObj.push(a[0]); return; }
    if (m === "te0") {                  // the box's text, sent on Return
        var name = a.slice(a[0] === "text" ? 1 : 0).join(" ");
        if (step === 0) finish(0, true, "got \"" + name + "\" on Return");
        else if (step === 1) finish(1, true, "got \"" + name + "\" with no click in the box");
        else if (step === 2) finish(2, false, "Return came through, Esc did not");
        else note("text from the box outside a row", null, name);
        return;
    }
    if (m === "dlg") {
        if (step === 3) finish(3, true, "pop-up gave \"" + a.join(" ") + "\"");
        else note("pop-up text outside a row", null, a.join(" "));
        return;
    }
    if (m === "dlgcancel") { if (step === 3) finish(3, null, "pop-up was cancelled"); return; }
    note("heard " + m, null, a.join(" "));
}
function bang() { findBox(); redraw(); }
function loadbang() { findBox(); redraw(); }

function onclick(x, y) {
    var row = Math.floor((y - ROW_Y) / ROW_H);
    if (row < 0 || row >= ROWS.length || x > ROW_W) return;
    if (step === row && ROWS[row].bail && x >= BAIL[0] && x <= BAIL[0] + BAIL[1]) { finish(row, false, "nothing happened"); return; }
    start(row);
}
function ondrag(x, y, button) { if (!button) once("mouse-up reaches the script (ondrag, button 0)", true); }
function ondblclick() { once("double-click reaches the script", true); }
function onwheel() { once("mouse wheel reaches the script (onwheel)", true); }

// ---- paint ------------------------------------------------------------------
function say(s, x, y, size, c) {
    mgraphics.select_font_face("Arial");
    mgraphics.set_font_size(size);
    mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
    mgraphics.move_to(x, y);
    mgraphics.show_text(s);
}
function paint() {
    var w = W(), h = H();
    mgraphics.set_source_rgba(0.012, 0.016, 0.03, 1);
    mgraphics.rectangle(0, 0, w, h); mgraphics.fill();
    for (var i = 0; i < ROWS.length; i++) {
        var R = ROWS[i], y = ROW_Y + i * ROW_H, live = step === i;
        mgraphics.set_source_rgba(1, 1, 1, live ? 0.16 : 0.07);
        mgraphics.rectangle(6, y, ROW_W - 6, ROW_H - 3); mgraphics.fill();
        say(String(i + 1), 14, y + 18, 15, [1, 1, 1, 1]);
        say(R.say, 34, y + 12, 11, [1, 1, 1, 0.95]);
        var c = R.ok === true ? [0.45, 0.95, 0.6, 1] : R.ok === false ? [1, 0.45, 0.35, 1] : [0.7, 0.74, 0.8, 0.9];
        say(R.res ? (R.ok === true ? "OK: " : R.ok === false ? "NO: " : "") + R.res : "not run yet", 34, y + 24, 10, c);
        if (live && R.bail) {
            mgraphics.set_source_rgba(1, 0.45, 0.35, 0.9);
            mgraphics.rectangle(BAIL[0], y + 14, BAIL[1], 11); mgraphics.fill();
            say("NOTHING HAPPENED", BAIL[0] + 10, y + 23, 9, [0, 0, 0, 1]);
        }
    }
    var fy = ROW_Y + ROWS.length * ROW_H + 12;
    say("Files: " + fileOK + " of " + fileAll + " places wrote and read back." + (logPath ? "  Log: " + logPath : "  No log file, results are in the Max console."), 10, fy, 10, [0.7, 0.74, 0.8, 1]);
    say(tb ? "Text box: found." : "Text box: not found yet.", 10, fy + 14, 10, tb ? [0.7, 0.74, 0.8, 1] : [1, 0.45, 0.35, 1]);
    say("When all four rows show a result, tell Claude: done.", 10, fy + 28, 10, [1, 1, 1, 0.95]);
}

runFiles();
var findTask = new Task(findBox);   // the patcher may not hold the text box yet while this script loads
findTask.schedule(400);
