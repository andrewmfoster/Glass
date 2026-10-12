# Renders glass.jsui.js through harness.html (a Canvas stand-in for Max's mgraphics) beside the
# mock, in five paired states plus failure and box-size runs. Proves layout and logic, not Max's
# renderer. Run with the python that has Playwright and PIL; output PNGs land beside this file.
import asyncio, os, sys, json
from playwright.async_api import async_playwright
from PIL import Image, ImageChops, ImageStat
SP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(SP))
# the controls mock carries the face and the bank as well, in the versions picked
MOCK = "file://" + REPO + "/mockups/glass-controls-mock.html"
PMOCK = MOCK
HARN = "file://" + SP + "/harness.html?repo=" + REPO
SH = 4242
# the mock's seeded shatter, replayed into the script: same palette, same plate seed, same knob values
SHATTER_JS = """(() => { const r = rng(%d), hue = r() * 360, seed = (r() * 1e9) | 0;
  for (let m = 0; m < 8; m++) setMacro(m, r() * 127);
  loaded = null; plate = makePlate(palFromHue(hue), seed, W()); mgraphics.redraw(); })(); 0""" % SH
async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.webkit.launch(executable_path=os.path.expanduser("~/Library/Caches/ms-playwright/webkit-2342/pw_run.sh"))
        async def mock(q, name, page=MOCK):
            pg = await b.new_page(viewport={"width": 1500, "height": 900})
            await pg.goto(page + q, wait_until="commit"); await asyncio.sleep(0.8)
            await pg.locator("#zoom").screenshot(path=f"{SP}/mock-{name}.png")
        async def port(q, name, js=None, wait=700):
            pg = await b.new_page(viewport={"width": 1500, "height": 900})
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(HARN + q, wait_until="commit")
            for _ in range(50):
                if await pg.evaluate("window.LOADED === true"): break
                await asyncio.sleep(0.1)
            await asyncio.sleep(wait / 1000)          # bootTask (300 ms) binds the stub rack
            if js: await pg.evaluate(js)
            await asyncio.sleep(0.3)
            await pg.locator("#c").screenshot(path=f"{SP}/port-{name}.png")
            info = await pg.evaluate("({R: window.R || null, log: LOG, err: PAINT_ERR, unknown: UNKNOWN, calls: CALLS, made: JImage.made, freed: JImage.freedN, trash: trash.length, sets: LIVE.sets, ready: ready, vals: vals.map(v => Math.round(v))})")
            info["pageerr"] = errs; out[name] = info; return info
        await mock("", "default"); await port("", "default")
        await mock("?preset=1", "angels"); await port("", "angels", "preset(1); 0")
        await mock("?preset=0&hover=2", "midnight-hover"); await port("", "midnight-hover", "preset(0); onidle(kx(2, W()), KY); 0")
        await mock("?preset=2", "ghosts"); await port("", "ghosts", "onclick(pillX(2, W()) + 30, 27); 0")
        await mock(f"?shatter={SH}", "shatter"); await port("", "shatter", SHATTER_JS)
        # states with no mock twin
        await port("", "flicker", "Date.prototype.getTime = (g => function () { return g.call(this); })(Date.prototype.getTime); onclick(shatterRect()[0] + 50, shatterRect()[1] + 10); shT = now() - 30; flickTask.cancel(); mgraphics.redraw(); 0", )
        await port("&nosprites", "nosprites", "preset(1); 0")
        await port("&fail=live.set_line_cap", "nocap")
        await port("&fail=live.set_source_surface", "nosurface")
        await port("&fail=off.pattern_create_radial", "nooffradial")
        await port("&norack", "norack", wait=2800)
        await port("&w=704&h=187", "box704x187", "preset(2); 0")
        await port("&w=706&h=262", "box706x262")
        # interaction pass: drag, clamp, double-click, shatter x12, presets, resize
        await port("", "interact", """(() => {
          const w = W(), R = [];
          onclick(kx(0, w), KY); ondrag(kx(0, w), KY - 75); R.push(['drag up 75px -> macro0', Math.round(vals[0])]);
          ondrag(kx(0, w), KY - 900); R.push(['drag past top', vals[0]]); ondrag(kx(0, w), KY + 2000); R.push(['drag past bottom', vals[0]]);
          ondblclick(kx(3, w), KY); R.push(['dblclick knob 3 -> macro 2', vals[2]]);
          onclick(pillX(1, w) + 5, 20); R.push(['preset click', loaded && loaded.name, plate.key]);
          onclick(kx(5, w), KY); ondrag(kx(5, w), KY - 10); R.push(['after drag', loaded && loaded.name, plate.key]);
          for (let i = 0; i < 12; i++) { onclick(shatterRect()[0] + 5, shatterRect()[1] + 5); paintNow(); }
          R.push(['after 12 shatters', 'made', JImage.made, 'freed', JImage.freedN, 'plate.key', JSON.stringify(plate.key), 'ms', plate.ms]);
          onclick(pillX(0, w) + 5, 20); paintNow(); R.push(['preset after shatter', plate.key, 'freed', JImage.freedN]);
          box.rect = [10, 20, 10 + 720, 190]; onresize(); R.push(['hit miss', knobAt(3, 3), presetAt(3, 3), shatterAt(3, 3)]);
          capture('ghosts'); shatter(); preset(7); bang();
          window.R = R; })(); 0""", wait=700)
        # the knob layer: hover, grab and drag one knob for 45 paints, with the layer and without it
        DRAG = """(() => { const w = W(), R = []; %s
          onidle(kx(2, w), KY); paintNow(); onclick(kx(2, w), KY); paintNow();
          let hits = 0; const bl = blit; blit = function (im) { if (im === layer.img) hits++; return bl.apply(this, arguments); };
          for (let i = 1; i <= 45; i++) { ondrag(kx(2, w), KY - i); paintNow(); }
          R.push(['drag 45 paints', 'layer.on', layer.on, 'own', layer.own, 'paints that used the layer', hits, 'macro1', Math.round(vals[1])]);
          onclick(shatterRect()[0] + 5, shatterRect()[1] + 5); paintNow(); R.push(['during the flash', 'want', JSON.stringify(layer.want)]);
          shT = -1; flickTask.cancel(); preset(1); paintNow(); onidle(kx(6, w), KY); paintNow(); paintNow(); R.push(['hover 6 after a preset', 'own', layer.own, 'used', layer.key === layer.want]);
          window.R = R; })(); 0"""
        await port("", "drag", DRAG % "")
        await port("", "drag-nolayer", DRAG % "layer.on = false;")
        await port("&fail=off.rotate", "drag-norotate", DRAG % "")
        await port("&fail=off.fill_with_alpha", "drag-nofill", DRAG % "")
        # ---- the preset bank: every run's R rows are [what, passed, detail] ----
        PRE = """const w = W(), R = [], PATH = '~/Documents/GLASS Presets.json', nap = ms => new Promise(r => setTimeout(r, ms));
          const ok = (what, cond, detail) => R.push([what, !!cond, detail === undefined ? '' : String(detail)]);
          const caret = s => onclick(pillX(s, w) + 54, 30), nameClick = s => onclick(pillX(s, w) + 20, 20);
          const row = v => { const L = listRect(); onclick(L.x + 40, L.y + 1 + v * 17 + 8); };
          const foot = k => { const L = listRect(); onclick(L.x + L.w / 3 * (k + .5), L.y + 1 + L.rows * 17 + 10); };
          const disk = () => PATH in FILES ? JSON.parse(FILES[PATH]) : null;
          const names = () => bank.map(P => P.name).join(','), slots = () => slotRef.map(P => P.name).join(',');
          const near = (a, b) => a.slice(0, 8).every((v, i) => Math.abs(v - b[i]) < 0.006);   // the eight a preset holds; MIX is the ninth
          const warns = () => LOG.filter(l => l.indexOf('WARNING') >= 0).length;
          window.R = R;"""
        BANK = "(async () => {" + PRE + """
          ok('at rest: no list, no file, three stock slots', !menu && !edit && !(PATH in FILES) && slots() === 'MIDNIGHT,ANGELS,GHOSTS', slots());
          nameClick(1); ok('a name click loads the slot', loaded && loaded.name === 'ANGELS' && plate.key === 'p1' && Math.round(vals[0]) === 127, plate.key);
          preset(2); ok('the preset message loads by slot', loaded.name === 'GHOSTS' && plate.key === 'p2');
          caret(0); ok('the caret opens the bank on its slot', menu && menu.slot === 0 && listRect().rows === 3 && loaded.name === 'GHOSTS', JSON.stringify(menu));
          paintNow(); ok('the open list paints', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
          onidle(listRect().x + 40, listRect().y + 1 + 17 + 8); ok('hover lands on a row and not on the knob under the list', hoverRow === 1 && hoverKnob === -1 && hoverPreset === -1, hoverRow + ' ' + hoverKnob);
          onidle(listRect().x + 100, 106); ok('a knob under the list is not hovered', hoverKnob === -1 && knobAt(listRect().x + 100, 106) >= 0, hoverKnob);
          caret(0); ok('the caret closes its own list and loads nothing', !menu && loaded.name === 'GHOSTS');
          caret(0); row(2); ok('picking a row fills the slot and loads it', !menu && slots() === 'GHOSTS,ANGELS,GHOSTS' && loaded.name === 'GHOSTS', slots());
          ok('slots alone never create the file', !(PATH in FILES) && FOPS.writes === 0, FOPS.writes);
          caret(0); foot(1); const e1 = !!edit; foot(2); ok('RENAME and DELETE do nothing on a stock preset', !e1 && !edit && menu && !menu.arm && names() === 'MIDNIGHT,ANGELS,GHOSTS');
          onclick(shatterRect()[0] + 5, shatterRect()[1] + 5); ok('a click off the list closes it and still counts', !menu && loaded === null && !plate.key);
          shT = -1; flickTask.cancel();
          caret(1); onclick(kx(0, w), KY); ok('a knob under no list takes the click that closed the list', !menu && drag.knob === 0);
          const kept = vals.slice(), seed = plate.seed, pal0 = plate.pal[0];
          caret(2); foot(0);
          let U = bank[3];
          ok('SAVE NEW adds USER 1 with the knobs and the glass', bank.length === 4 && U.name === 'USER 1' && near(U.vals, kept) && U.seed === seed && U.accent === pal0, names());
          ok('SAVE NEW puts it in the slot, loads it and closes the list', slotRef[2] === U && loaded === U && !menu, slots());
          ok('the name box opens over the slot, filled and focused', edit && edit.slot === 2 && NAMEBOX.hidden === 0 && NAMEBOX.focus && NAMEBOX.text === 'USER 1' && JSON.stringify(NAMEBOX.rect) === JSON.stringify([pillX(2, w) + 1, 16, 72, 15]), JSON.stringify(NAMEBOX.rect));
          let d = disk();
          ok('the save wrote the file: one preset, three slots', d && d.version === 1 && d.presets.length === 1 && d.presets[0].name === 'USER 1' && d.slots.join('|') === 'stock 2|stock 1|' + U.id && onDisk, d && d.slots.join('|'));
          paintNow(); ok('the face paints while a name is typed', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
          NAMEBOX.type('autumn'); NAMEBOX.ret(); U = bank[3];
          ok('Return keeps the typed name, in capitals', U.name === 'AUTUMN' && !edit && NAMEBOX.hidden === 1 && disk().presets[0].name === 'AUTUMN', U.name);
          nameClick(1); const away = loaded.name; nameClick(2);
          ok('the saved preset comes back: knobs and glass', away === 'ANGELS' && loaded === U && near(vals, kept) && plate.seed === seed && plate.key === '', plate.seed + ' ' + seed);
          caret(2); foot(1); NAMEBOX.type('  my long preset name'); NAMEBOX.ret(); U = bank[3];
          ok('RENAME: nine characters, trimmed', U.name === 'MY LONG P' && disk().presets[0].name === 'MY LONG P' && !menu, JSON.stringify(U.name));
          caret(2); foot(1); NAMEBOX.type('ZZZ'); NAMEBOX.esc(); ok('Esc leaves the name as it was', bank[3].name === 'MY LONG P' && !edit && NAMEBOX.hidden === 1);
          caret(2); foot(1); NAMEBOX.type(''); NAMEBOX.ret(); const open0 = !!edit; await nap(160);
          ok('Return on an empty box closes it and keeps the name', open0 && !edit && bank[3].name === 'MY LONG P' && NAMEBOX.hidden === 1);
          caret(2); foot(1); NAMEBOX.type('clicked'); onclick(5, 160);
          ok('a click somewhere else keeps what was typed', bank[3].name === 'CLICKED' && !edit && disk().presets[0].name === 'CLICKED', bank[3].name);
          caret(2); foot(1); NAMEBOX.type('caf\\u00e9 "x"'); NAMEBOX.ret(); ok('a name keeps plain characters only and still reads back', bank[3].name === 'CAF "X"' && onDisk && disk().presets[0].name === 'CAF "X"', bank[3].name);
          for (let i = 0; i < 7; i++) { onclick(shatterRect()[0] + 5, shatterRect()[1] + 5); shT = -1; flickTask.cancel(); caret(0); foot(0); NAMEBOX.ret(); }
          ok('seven more saves are named USER 1 to USER 7', names() === 'MIDNIGHT,ANGELS,GHOSTS,CAF "X",USER 1,USER 2,USER 3,USER 4,USER 5,USER 6,USER 7' && disk().presets.length === 8, names());
          caret(0); const L = listRect();
          ok('a long bank shows six rows, opened near the slot preset', L.rows === 6 && menu.scroll === 5 && maxScroll() === 5, menu.scroll);
          paintNow(); ok('the scrolling list paints', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
          onclick(L.x + L.w - 4, L.y + 60); ondrag(L.x + L.w - 4, L.y + 60 - 28, 1); const sc = menu.scroll; ondrag(L.x + L.w - 4, L.y + 60 - 400, 1); const top = menu.scroll; ondrag(0, 0, 0);
          ok('dragging the bar scrolls and stops at the top', sc === 2 && top === 0 && barDrag === null && menu, sc + ' ' + top);
          ondrag(L.x, L.y + 500, 1); ok('the bar is let go on mouse-up', menu.scroll === 0);
          onclick(L.x + L.w - 4, L.y + 20); ondrag(L.x + L.w - 4, L.y + 20 + 400, 1); ondrag(0, 0, 0); ok('and at the bottom', menu.scroll === 5, menu.scroll);
          row(0); ok('a row click counts from the scroll', slotRef[0].name === 'USER 2' && loaded.name === 'USER 2', slotRef[0].name);
          caret(0); foot(2); const armed = menu.arm, n0 = bank.length; onclick(listRect().x + listRect().w - 4, listRect().y + 20); ondrag(0, 0, 0);
          ok('DELETE asks once more, and another click calls it off', armed && !menu.arm && bank.length === n0);
          foot(2); paintNow(); foot(2);
          ok('the second click deletes: bank, slot, file', bank.length === n0 - 1 && names().indexOf('USER 2') < 0 && slotRef[0] === PRESETS[0] && loaded === null && menu && disk().presets.length === 7 && disk().slots[0] === 'stock 0', names());
          ok('the list stays open after a delete, scrolled inside the bank', menu.scroll <= maxScroll() && PAINT_ERR.length === 0);
          onclick(5, 160);
          // another GLASS device writes the same file
          const o = disk(); o.presets.push({ id: 'other-1', name: 'ELSEWHERE', seed: 5, vals: [1, 2, 3, 4, 5, 6, 7, 8], pal: [[1, 0, 0], [0, 1, 0]] }); o.presets[0].name = 'RENAMED'; FILES[PATH] = JSON.stringify(o);
          nameClick(2); const held = loaded; caret(1);
          ok('opening the list takes what another device saved', names().indexOf('ELSEWHERE') > 0 && bank[3].name === 'RENAMED' && loaded && loaded.id === held.id && loaded.name === 'RENAMED', names());
          const o2 = disk(); o2.presets.push({ id: 'other-2', name: 'SECOND', seed: 6, vals: [1, 2, 3, 4, 5, 6, 7, 8], pal: [[0, 0, 1]] }); FILES[PATH] = JSON.stringify(o2);
          foot(0); NAMEBOX.ret();
          ok('a save here keeps what the other device saved in between', disk().presets.map(P => P.name).indexOf('SECOND') > 0 && disk().presets.length === bank.length - 3 && names().indexOf('SECOND') > 0, disk().presets.map(P => P.name).join(','));
          const before = names(); FILES[PATH] = '{nope'; caret(0);
          ok('an unreadable file leaves memory as it was, with one warning', names() === before && warns() === 1, warns());
          foot(0); NAMEBOX.ret(); ok('and the next save replaces it', disk() && disk().presets.length === bank.length - 3 && onDisk);
          onclick(kx(2, w), KY); ondrag(kx(2, w), KY - 20, 1); ok('a knob move leaves the preset', loaded === null);
          paintNow(); ok('no paint errors, no page errors through the pass', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))"""
        await port("", "bank", BANK)
        two = json.dumps({"version": 1, "slots": ["b", "stock 2", "nobody"], "presets": [
            {"id": "a", "name": "first one", "seed": 77, "vals": [10, 20, 30, 40, 50, 60, 70, 80], "pal": [[1, 0.5, 0], [0, 0.5, 1]]},
            {"id": "b", "name": "SECOND", "seed": 78, "vals": [1, 2, 3, 4, 5, 6, 7, 8], "pal": [[0.2, 1, 0.4]]},
            {"id": "c", "name": "BROKEN", "vals": [1, 2]}, "junk"]})
        from urllib.parse import quote
        await port("&bank=" + quote(two), "bank-boot", "(async () => {" + PRE + """
          ok('a bank on disk is read at load', names() === 'MIDNIGHT,ANGELS,GHOSTS,FIRST ONE,SECOND' && onDisk, names());
          ok('its slots come back, a missing one falls to stock', slots() === 'SECOND,GHOSTS,GHOSTS', slots());
          ok('the load says so in one console line', LOG.filter(l => l.indexOf('bank: 2 saved, file read, name box found') >= 0).length === 1, LOG.join(' / '));
          nameClick(0); ok('a preset from disk loads its knobs and makes its glass', Math.round(vals[7]) === 8 && plate.seed === 78 && loaded.name === 'SECOND');
          caret(1); row(0); ok('a slot change is kept once the file exists', JSON.parse(FILES[PATH]).slots.join('|') === 'b|stock 0|stock 2', JSON.parse(FILES[PATH]).slots.join('|'));
          paintNow(); ok('no paint errors', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&notrunc", "bank-notrunc", "(async () => {" + PRE + """
          caret(0); foot(0); NAMEBOX.ret(); caret(1); foot(0); NAMEBOX.type('A MUCH LONGER'); NAMEBOX.ret(); const long = FILES[PATH].length;
          caret(1); foot(2); foot(2);
          ok('a file that cannot be cut short is blanked to its end and still reads', FILES[PATH].length === long && /\\s$/.test(FILES[PATH]) && disk().presets.length === 1 && onDisk && warns() === 0, FILES[PATH].length + ' ' + long);
          syncBank(); ok('and reads back as the same bank', names() === 'MIDNIGHT,ANGELS,GHOSTS,USER 1', names());
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        for q, name, what in (("&nofile", "bank-nofile", "no file opens"), ("&nodocs", "bank-nodocs", "a write that keeps nothing")):
            await port(q, name, "(async () => {" + PRE + """
              caret(0); foot(0); NAMEBOX.type('KEPT'); NAMEBOX.ret(); caret(1); foot(0); NAMEBOX.ret();
              ok('%s: saves work for the session, one warning, nothing thrown', names() === 'MIDNIGHT,ANGELS,GHOSTS,KEPT,USER 1' && !onDisk && warns() === 1 && loaded && loaded.name === 'USER 1', names() + ' warns ' + warns());
              paintNow(); ok('no paint errors', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
            })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""" % what)
        await port("&nobox", "bank-nobox", "(async () => {" + PRE + """
          ok('the load says the device has no name box', LOG.filter(l => l.indexOf('name box not in this device') >= 0).length === 1, LOG.join(' / '));
          caret(0); foot(0); ok('with no name box SAVE NEW still saves, as USER 1', names() === 'MIDNIGHT,ANGELS,GHOSTS,USER 1' && !edit && !menu && slotRef[0].name === 'USER 1' && disk().presets.length === 1, names());
          caret(0); foot(1); ok('and RENAME stays dim', !edit && menu && !footLive(1, slotRef[0]));
          foot(2); foot(2); ok('DELETE still works', names() === 'MIDNIGHT,ANGELS,GHOSTS' && disk().presets.length === 0, names());
          paintNow(); ok('no paint errors', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&mkbox", "bank-mkbox", "(async () => {" + PRE + """
          ok('a device with no name box makes one, wired to the face and below the device view', LOG.filter(l => l.indexOf('name box made') >= 0).length === 1 && NAMEBOX.varname === 'namebox' && NAMEBOX.hidden === 1 && MADE.length === 3 && MADE.every(m => m[1] >= 400) && JSON.stringify(WIRES) === JSON.stringify([['namebox', 0, 'prepend te0', 0], ['namebox', 1, 'prepend te1', 0], ['prepend te0', 0, 'jsui', 0], ['prepend te1', 0, 'jsui', 0]]), LOG.join(' / ') + ' ' + JSON.stringify(WIRES));
          ok('the box is dressed once, made or found, with no refusal', NAMEBOX.msgs.filter(m => m[0] === 'bgcolor').length === 1 && NAMEBOX.msgs.filter(m => m[0] === 'bgcolor')[0].length === 5 && NAMEBOX.msgs.filter(m => m[0] === 'keymode')[0][1] === 1 && LOG.filter(l => l.indexOf('refused') >= 0).length === 0, JSON.stringify(NAMEBOX.msgs.slice(0, 14)));
          caret(0); foot(0); ok('the made box opens over the slot in the patching view and the presentation', edit && NAMEBOX.hidden === 0 && NAMEBOX.focus && JSON.stringify(NAMEBOX.prect) === JSON.stringify([10 + pillX(0, w) + 1, 20 + 16, 72, 15]) && JSON.stringify(NAMEBOX.rect) === JSON.stringify([pillX(0, w) + 1, 16, 72, 15]), JSON.stringify(NAMEBOX.prect) + ' ' + JSON.stringify(NAMEBOX.rect));
          NAMEBOX.type('made'); NAMEBOX.ret(); ok('a name typed in the made box is kept', bank[3].name === 'MADE' && !edit && NAMEBOX.hidden === 1 && disk().presets[0].name === 'MADE' && MADE.length === 3, bank[3].name);
          caret(0); ok('RENAME is live with the made box', menu && footLive(1, slotRef[0]));
          paintNow(); ok('no paint errors', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&latepath=2", "bank-latepath", "(async () => {" + PRE + """
          await nap(900);
          ok('a device whose path is not there yet binds on a later try', ready && LOG.filter(l => l.indexOf('macros bound=8') >= 0).length === 1 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, LOG.join(' / '));
          const v0 = vals[0]; onclick(kx(0, w), KY); ondrag(kx(0, w), KY - 30, 1, 0, 1); const fine = vals[0] - v0; ondrag(kx(0, w), KY - 60, 1, 0, 0); const coarse = vals[0] - v0 - fine; ondrag(0, 0, 0);
          ok('Shift makes a drag ten times finer', Math.abs(fine - 2.54) < 0.01 && Math.abs(coarse - 25.4) < 0.01, fine + ' ' + coarse);
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # the quick tries run out (boot + 10 at 200 ms = 2.3 s), then one look a second
        SLOW = """
          const t0 = Date.now(), unbound = !ready, w0 = LOG.filter(l => l.indexOf('%s') >= 0).length;
          while (!ready && Date.now() - t0 < 6000) await nap(100);
          ok('%s: still unbound after the quick tries, with one warning', unbound && w0 === 1, unbound + ' ' + w0 + ' ' + LOG.join(' / '));
          ok('%s: it binds on a slow try, warned once, bound once', ready && LOG.filter(l => l.indexOf('macros bound=8') >= 0).length === 1 && LOG.filter(l => l.indexOf('%s') >= 0).length === 1, (Date.now() - t0) + ' ms ' + LOG.join(' / '));
          const v0 = vals[0]; onclick(kx(0, w), KY); ondrag(kx(0, w), KY - 60, 1, 0, 0); ondrag(0, 0, 0);
          ok('%s: a knob drag reaches the rack after the late bind', vals[0] !== v0 && LIVE.sets > 0, vals[0] + ' ' + LIVE.sets);
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))"""
        await port("&latepath=13", "bank-slowpath", "(async () => {" + PRE + SLOW % ("WARNING", "no path for 13 looks", "no path for 13 looks", "WARNING", "no path for 13 looks"), wait=2500)
        await port("&boompath=13", "bank-boompath", "(async () => {" + PRE + SLOW % ("EXC initLOM", "13 looks that throw", "13 looks that throw", "EXC initLOM", "13 looks that throw"), wait=2500)
        await port("&norack", "bank-norack", "(async () => {" + PRE + """
          await nap(2600);
          ok('a device outside a rack keeps looking and warns once', !ready && warns() === 1 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, LOG.join(' / '));
          LIVE.inRack = true; await nap(1200);
          ok('and binds within a second of landing in one', ready && LOG.filter(l => l.indexOf('macros bound=8') >= 0).length === 1 && warns() === 1, LOG.join(' / '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""", wait=2500)
        await port("&latebang", "bank-latebang", "(async () => {" + PRE + """
          caret(0); foot(0); NAMEBOX.type('slow text'); onclick(5, 160); const then = bank[3].name; await nap(120);
          ok('text that arrives after the click still lands on its preset', then === 'USER 1' && bank[3].name === 'SLOW TEXT' && !edit && disk().presets[0].name === 'SLOW TEXT', then + ' -> ' + bank[3].name);
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&nobang", "bank-nobang", "(async () => {" + PRE + """
          caret(0); foot(0); NAMEBOX.type('lost'); onclick(5, 160); await nap(120);
          ok('a box that gives nothing on a click away leaves the name', bank[3].name === 'USER 1' && !edit && NAMEBOX.hidden === 1, bank[3].name);
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&ox=12&oy=3", "bank-offset", "(async () => {" + PRE + """
          caret(1); foot(0); ok('the box follows where the face sits in the device', JSON.stringify(NAMEBOX.rect) === JSON.stringify([12 + pillX(1, w) + 1, 3 + 16, 72, 15]), JSON.stringify(NAMEBOX.rect));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # ---- back, hold and glide, by message and by the clicks that exist today ----
        await port("", "ctl-engine", "(async () => {" + PRE + """
          const sh = () => { onclick(shatterRect()[0] + 5, shatterRect()[1] + 5); shT = -1; flickTask.cancel(); };
          const v0 = vals.slice(), s0 = plate.seed;
          ok('at rest: nothing to go back to, nothing held, glide off', hist.length === 0 && !held.some(Boolean) && glideSel === 0 && !anim);
          back(); ok('BACK with nothing to go back to does nothing', near(vals, v0) && plate.seed === s0 && LIVE.sets === 0, LIVE.sets);
          sh(); const v1 = vals.slice(), s1 = plate.seed;
          ok('a SHATTER is one step', hist.length === 1 && !near(v1, v0) && LIVE.sets === 8, hist.length + ' ' + LIVE.sets);
          nameClick(1); ok('a preset load is one step', hist.length === 2 && loaded.name === 'ANGELS' && plate.key === 'p1', hist.length);
          nameClick(1); ok('loading the preset already on the knobs is not a step', hist.length === 2, hist.length);
          back(); ok('BACK from a preset returns the SHATTER: knobs and glass', near(vals, v1) && plate.seed === s1 && loaded === null && !plate.key && hist.length === 1, plate.seed + ' ' + s1);
          back(); ok('BACK again returns the start: knobs and the first glass', near(vals, v0) && plate.seed === s0 && plate.key === 'icon' && hist.length === 0, plate.key);
          preset(0); preset(2); back(); ok('the preset message is a step too, and BACK lights the preset it returns to', loaded === PRESETS[0] && plate.key === 'p0' && near(vals, PRESETS[0].vals) && hist.length === 1, loaded && loaded.name);
          sh(); onclick(kx(0, w), KY); ondrag(kx(0, w), KY - 20, 1); const v2 = vals.slice(), n2 = hist.length; sh(); back();
          ok('a knob drag is not a step, and BACK returns the knobs as dragged', near(vals, v2) && hist.length === n2, hist.length + ' ' + n2);
          for (let i = 0; i < 20; i++) sh(); ok('BACK keeps 16 steps', hist.length === 16, hist.length);
          paintNow(); caret(0); foot(0); NAMEBOX.ret(); const U = bank[3]; sh(); caret(0); foot(2); foot(2); onclick(5, 160); back();
          ok('BACK onto a preset deleted since: its knobs and glass, no preset lit', bank.length === 3 && loaded === null && near(vals, U.vals) && plate.seed === U.seed, bank.length + ' ' + plate.seed);
          hist.length = 0; hold(0, 1); hold(3);
          const h0 = vals[0], h2 = vals[2], o1 = vals[1], n0 = LIVE.sets; sh();
          ok('SHATTER leaves a held knob alone and writes only the others', vals[0] === h0 && vals[2] === h2 && vals[1] !== o1 && held[0] && held[2] && LIVE.sets - n0 === 6, LIVE.sets - n0);
          for (let i = 0; i < 6; i++) sh(); ok('and again over six more', vals[0] === h0 && vals[2] === h2);
          nameClick(0); ok('a preset load moves held knobs too', Math.round(vals[0]) === 82 && Math.round(vals[2]) === 69, vals[0]);
          hold(0, 0); hold(3); hold(9); ok('hold comes off', !held.some(Boolean));
          glide(); const g1 = glideSel; glide(); const g2 = glideSel; for (let i = 0; i < 5; i++) glide(); const g3 = glideSel; glide(9); const g4 = glideSel; glide(-3); const g5 = glideSel; glide(4); const g6 = glideSel; glide(0);
          ok('the glide message steps through seven lengths, round to OFF, and takes a number', g1 === 1 && g2 === 2 && g3 === 0 && g4 === 6 && g5 === 0 && g6 === 4 && glideSel === 0 && GLIDES.join() === 'OFF,1/8,1/4,1/2,1 BAR,2 BARS,4 BARS', [g1, g2, g3, g4, g5, g6].join());
          const lens = () => [1, 2, 3, 4, 5, 6].map(i => { glide(i); return glideMs(); }).join();
          const b1 = lens(); LIVE.sig = [3, 4]; const b3 = lens(); LIVE.sig = [6, 8]; const b4 = lens(); LIVE.bpm = undefined; LIVE.sig = [undefined, undefined]; const b5 = lens(); glide(0); const b6 = glideMs();
          ok('the notes follow the tempo and the bars the time signature too, 120 in 4/4 when Live gives none', b1 === '250,500,1000,2000,4000,8000' && b3 === '250,500,1000,1500,3000,6000' && b4 === b3 && b5 === b1 && b6 === 0, [b1, b3, b4, b5, b6].join(' / '));
          LIVE.bpm = 600; LIVE.sig = [4, 4]; glide(4); hist.length = 0;
          const a0 = vals.slice(); nameClick(1);
          ok('with glide on a preset load does not jump', near(vals, a0) && anim && anim.dur === 400 && glideTask.running && loaded.name === 'ANGELS' && plate.key === 'p1', anim && anim.dur);
          await nap(150); const m0 = vals[0];
          ok('mid-glide the knobs are on the way', m0 > a0[0] && m0 < 127 && anim, m0);
          paintNow(); await nap(400);
          ok('the glide lands on the preset and stops', near(vals.slice(0, 8), PRESETS[1].vals) && !anim && !glideTask.running, vals.map(v => Math.round(v)).join());
          nameClick(0); await nap(120); sh(); const top = hist[hist.length - 1];
          ok('a SHATTER mid-glide remembers where the knobs were heading', near(top.vals, PRESETS[0].vals) && top.loaded === PRESETS[0] && anim && glideTask.running, top.vals.map(v => Math.round(v)).join());
          const dest = anim.to.slice(); await nap(120); back(); await nap(520);
          ok('BACK glides too, onto the preset the SHATTER left', near(vals.slice(0, 8), PRESETS[0].vals) && loaded === PRESETS[0] && plate.key === 'p0' && !anim && !near(dest, PRESETS[0].vals), vals.map(v => Math.round(v)).join());
          nameClick(1); await nap(100); onclick(kx(0, w), KY); ondrag(kx(0, w), KY - 10, 1); const grabbed = vals[0]; await nap(450);
          ok('a grabbed knob leaves the glide and the rest land', vals[0] === grabbed && grabbed < 127 && near(vals.slice(1, 8), PRESETS[1].vals.slice(1)) && !anim, grabbed);
          hold(1, 1); const hv = vals[7], hn = LIVE.sets; sh(); await nap(450);
          ok('a held knob is never written during a glided SHATTER', vals[7] === hv && (LIVE.sets - hn) % 7 === 0 && LIVE.sets > hn, LIVE.sets - hn);
          hold(1, 0); nameClick(0); await nap(80); caret(2); foot(0); NAMEBOX.ret();
          ok('a save mid-glide keeps where the knobs were heading', near(bank[bank.length - 1].vals, PRESETS[0].vals), bank[bank.length - 1].vals.map(v => Math.round(v)).join());
          await nap(450); paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("", "ctl-face", "(async () => {" + PRE + """
          const SR = shatterRect(), lab = i => onclick(kx(i, w), 152), bk = () => onclick(backX(), 27), gw = () => onclick(glideX() + 10, 27);
          const grow = i => { const G = glistRect(); onclick(G.x + 20, G.y + 1 + (i + .5) * 15); };
          ok('SHATTER sits where it did, the arrow and the glide text 10 px off its box on either side, clear of the slots', Math.abs(SR[0] - 296.44) < 0.1 && Math.abs(SR[0] - (backX() + 6.45) - 10) < 0.001 && Math.abs(glideX() - (SR[0] + 104) - 10) < 0.001 && glideX() + 36 <= pillX(0, w) - 14, SR[0] + ' ' + backX() + ' ' + glideX());
          bk(); ok('the arrow does nothing with nothing to go back to', hist.length === 0 && LIVE.sets === 0);
          const v0 = vals.slice(); onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel(); bk();
          ok('a click on the arrow steps back', near(vals, v0) && hist.length === 0 && plate.key === 'icon', plate.key);
          gw(); const G = glistRect();
          ok('a click on the glide word opens the lengths as a list and changes nothing yet', gmenu && glideSel === 0 && !menu && hist.length === 0);
          ok('the list starts on the glide text and stays on the face', G.x + 10 === glideX() && G.x + G.w <= w - 8 && G.y + G.h <= 170 && G.h === 7 * 15 + 2, JSON.stringify(G));
          paintNow(); ok('the open glide list paints', PAINT_ERR.length === 0, PAINT_ERR.join(' | '));
          onidle(G.x + 20, G.y + 1 + 3.5 * 15); ok('hover lands on a row and not on the knob under the list', hoverGrow === 3 && hoverKnob === -1 && knobAt(G.x + 20, G.y + 1 + 3.5 * 15) >= 0 && !hoverGlide, hoverGrow + ' ' + hoverKnob);
          paintNow(); grow(5); ok('a row picks its length and shuts the list', !gmenu && glideSel === 5 && hoverGrow === -1 && drag.knob === -1, glideSel);
          gw(); gw(); ok('the glide word shuts its own list and keeps the length', !gmenu && glideSel === 5, glideSel);
          gw(); caret(0); const m1 = !!menu && !gmenu; gw(); ok('one list shuts the other, both ways', m1 && gmenu && !menu);
          grow(0); gw(); onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel();
          ok('a click off the list shuts it and still counts', !gmenu && glideSel === 0 && hist.length === 1 && loaded === null && !plate.key, hist.length);
          bk(); gw(); onidle(G.x + 20, G.y + 1 + 8); onidleout(); const hr0 = hoverGrow; onclick(5, 160); ok('leaving the face drops the row hover, and a click on bare glass shuts the list', hr0 === -1 && !gmenu && near(vals, v0) && hist.length === 0);
          gw(); glide(); const g1 = glideSel, o1 = gmenu; glide(0); onclick(5, 160); ok('the glide message still steps with the list open', g1 === 1 && o1 && !gmenu && glideSel === 0, g1);
          lab(0); lab(3); ok('a click on a label holds that knob', held[0] && held[2] && held.filter(Boolean).length === 2 && drag.knob === -1 && near(vals, v0), JSON.stringify(held));
          lab(3); ok('and a second click lets it go', held[0] && !held[2]);
          onidle(kx(5, w), 152); const hh = hoverHold, hk = hoverKnob; onidle(backX(), 27); const hb = hoverBack; onidle(glideX() + 10, 27); const hg = hoverGlide; onidleout();
          ok('hover finds a label, the arrow and the glide word', hh === 5 && hk === -1 && hb && hg && hoverHold === -1 && !hoverBack && !hoverGlide, [hh, hk, hb, hg].join());
          caret(0); const L = listRect(); onclick(L.x + 40, L.y + 1 + 8); ok('a label under the open list is not clicked through it', !menu && held.filter(Boolean).length === 1);
          box.rect = [10, 20, 10 + 640, 190]; const N = shatterRect(), fits = glideX() + 36 <= pillX(0, W()) - 14 + 0.01 && N[0] < 296 && Math.abs(N[0] - (backX() + 6.45) - 10) < 0.001; box.rect = [10, 20, 10 + w, 190];
          ok('in a narrow box SHATTER gives way so the glide text still fits, the arrow moving with it', fits, N[0]);
          lab(3); glide(1); onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel(); await nap(700); onidle(kx(6, w), 152);
          paintNow(); ok('the face paints with steps to go back to, two knobs held and glide on', PAINT_ERR.length === 0 && hist.length === 2 && held[0] && held[2] && glideSel === 1 && !anim && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | ') + LOG.filter(l => l.indexOf('EXC') >= 0).join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("", "ctl-mix", "(async () => {" + PRE + """
          const mx = kx(8, w), SR = shatterRect(), sh = () => { onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel(); };
          ok('MIX is bound to the ninth macro and stands off the row', params[8] && Math.round(vals[8]) === 127 && mx === w - 54 && mx - kx(7, w) > 90 && kx(1, w) - kx(0, w) < 72, mx + ' ' + kx(7, w));
          ok('the load still reports eight macros bound', LOG.filter(l => l.indexOf('macros bound=8') >= 0).length === 1, LOG.join(' / '));
          nameClick(1); onclick(mx, KY); ondrag(mx, KY + 75, 1); const m1 = vals[8];
          ok('a drag on MIX moves the ninth macro and leaves the preset lit', Math.round(m1) === 64 && Math.round(LIVE.vals[8]) === 64 && loaded && loaded.name === 'ANGELS' && near(vals.slice(0, 8), PRESETS[1].vals), m1);
          sh(); nameClick(0); back(); back(); ok('SHATTER, a preset load and BACK leave MIX alone', vals[8] === m1 && LIVE.vals[8] === m1 && hist.length === 1, vals[8]);
          glide(4); LIVE.bpm = 600; sh(); await nap(520); glide(0); ok('and so does a glide', vals[8] === m1 && !anim, vals[8]);
          caret(0); foot(0); NAMEBOX.ret(); ok('a saved preset holds eight values', bank[3].vals.length === 8 && disk().presets[0].vals.length === 8, bank[3].vals.length);
          onidle(mx, KY); const hk = hoverKnob; paintNow(); onidle(mx, 152); ok('hover shows on MIX, and its label holds nothing', hk === 8 && hoverHold === -1 && PAINT_ERR.length === 0, hk + ' ' + hoverHold + PAINT_ERR.join(' | '));
          onclick(mx, 152); ok('a click on the MIX label does nothing', !held.some(Boolean) && drag.knob === -1);
          ondblclick(mx, KY); ok('a double-click puts MIX back to all wet', vals[8] === 127, vals[8]);
          hold(8); ok('the hold message does not reach MIX', !held.some(Boolean));
          onidleout(); paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # ---- SHATTER on a pad: the rack's tenth macro. The stub rack calls no observer, so the values are handed to onPad ----
        await port("", "ctl-pad", "(async () => {" + PRE + """
          const still = () => { shT = -1; flickTask.cancel(); }, pad = async v => { onPad(['value', v]); await nap(60); still(); };
          ok('the pad watches the tenth macro, which starts in the low half', padApi && padApi.slot === 9 && padApi.property === 'value' && padSide === false && padMid === 63.5, padApi && padApi.slot);
          ok('the load still reports eight macros bound', LOG.filter(l => l.indexOf('macros bound=8') >= 0).length === 1, LOG.join(' / '));
          const v0 = vals.slice(); await pad(0); await pad(40);
          ok('a value in the same half does nothing', hist.length === 0 && LIVE.sets === 0 && near(vals, v0), hist.length);
          await pad(127); const v1 = vals.slice();
          ok('up over the middle is one SHATTER, and the pad macro is never written', hist.length === 1 && LIVE.sets === 8 && !near(v1, v0) && LIVE.vals[9] === 0 && loaded === null && !plate.key, hist.length + ' ' + LIVE.sets);
          await pad(127); await pad(100); ok('staying in the high half does nothing', hist.length === 1 && near(vals, v1), hist.length);
          await pad(0); ok('down over the middle is one SHATTER too', hist.length === 2 && LIVE.sets === 16, hist.length + ' ' + LIVE.sets);
          onPad(['value', 127]); ok('the SHATTER comes a tick after the value, never inside the call', hist.length === 2, hist.length); await nap(60); still();
          ok('and then lands', hist.length === 3, hist.length);
          back(); back(); back(); ok('BACK steps through a pad SHATTER like any other', near(vals, v0) && hist.length === 0 && plate.key === 'icon', plate.key);
          hold(0, 1); const h0 = vals[0], n0 = LIVE.sets; await pad(0);
          ok('a pad SHATTER leaves a held knob alone', vals[0] === h0 && LIVE.sets - n0 === 7 && hist.length === 1, LIVE.sets - n0);
          hold(0, 0); LIVE.bpm = 600; glide(4); const g0 = vals.slice(); onPad(['value', 127]); await nap(40); still();
          ok('with glide on a pad SHATTER glides', anim && glideTask.running && !near(vals.slice(0, 8), anim.to), anim && anim.dur);
          await nap(450); glide(0); const m8 = vals[8]; await pad(0); ok('MIX is left alone', vals[8] === m8 && LIVE.vals[8] === m8, vals[8]);
          onPad(['value']); onPad(['value', 'x']); onPad(['name', 127]); onPad(); await nap(60); const hn = hist.length;
          ok('anything that is not a value does nothing', hist.length === hn, hist.length);
          const old = padApi; LIVE.vals[9] = 127; bang(); const h1 = hist.length;
          ok('a re-resolve drops the old watch and makes one new one, in the half the macro is in now', old.property === '' && padApi && padApi !== old && padApi.property === 'value' && padSide === true, old.property);
          await pad(127); const same = hist.length - h1; await pad(0);
          ok('and it still fires once per crossing', same === 0 && hist.length - h1 === 1, same + ' ' + (hist.length - h1));
          ready = false; onPad(['value', 127]); await nap(60); const off = hist.length - h1; ready = true; padSide = false;
          ok('a value that arrives while the rack is not bound does nothing', off === 1, off);
          onPad(['value', 127]); freeObservers(); await nap(60); const fr = hist.length - h1;
          ok('a SHATTER waiting on its tick is dropped when the watch is freed', fr === 1 && padApi === null, fr);
          bindPad(['id', 100, 'id', 101]); ok('a rack with no tenth macro has no pad and nothing breaks', padApi === null);
          bang(); paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | ') + LOG.filter(l => l.indexOf('EXC') >= 0).join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # ---- held knobs and the glide length kept in the rack's macros 11 to 13. The stub rack calls no observer, so echoes are handed to onKeep ----
        await port("", "ctl-keep", "(async () => {" + PRE + """
          const SR = shatterRect(), sh = () => { onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel(); }, K = () => LIVE.vals.slice(10, 13).join();
          ok('four macros are watched, the eleventh to the fourteenth (PULSE), and nothing is written at rest', keepApi.length === 4 && keepApi.every((a, k) => a && a.slot === 10 + k && a.property === 'value') && LIVE.sets === 0 && K() === '0,0,0' && !held.some(Boolean) && glideSel === 0, K());
          hold(0, 1); const k1 = K(), s1 = LIVE.sets; hold(3); const k2 = K(), s2 = LIVE.sets; hold(1, 1); const k3 = K(), s3 = LIVE.sets;
          ok('a held knob is written as a bit, one macro per change', k1 === '1,0,0' && k2 === '5,0,0' && k3 === '5,8,0' && s1 === 1 && s2 === 2 && s3 === 3, [k1, k2, k3, s3].join(' / '));
          hold(1, 1); ok('holding a knob already held writes nothing', LIVE.sets === 3, LIVE.sets);
          onclick(kx(5, w), 152); ok('a click on a label is written too', K() === '5,9,0' && held[4] && LIVE.sets === 4, K());
          glide(4); const g1 = K(); glide(); const g2 = K(); onclick(glideX() + 10, 27); const G = glistRect(); onclick(G.x + 20, G.y + 1 + 2.5 * 15);
          ok('the glide length is written by message and from the list', g1 === '5,9,4' && g2 === '5,9,5' && K() === '5,9,2' && glideSel === 2 && LIVE.sets === 7, [g1, g2, K(), LIVE.sets].join(' / '));
          glide(0); const n0 = LIVE.sets; sh(); nameClick(1); back(); back();
          ok('SHATTER, a preset load and BACK leave the three macros alone', K() === '5,9,0' && held[0] && held[2] && held[7] && held[4], K());
          LIVE.vals[10] = 6; LIVE.vals[11] = 1; LIVE.vals[12] = 3; const old = keepApi.slice(); bang();
          ok('a load reads them back: the held knobs and the glide length', held.map(Boolean).join() === 'false,true,true,false,true,false,false,false' && glideSel === 3 && old.every(a => a.property === '') && keepApi.every((a, k) => a && a !== old[k] && a.property === 'value'), held.map(Boolean).join() + ' ' + glideSel);
          const n1 = LIVE.sets; paintNow(); ok('and reading them writes nothing back', LIVE.sets === n1 && K() === '6,1,3', K());
          onKeep(2, ['value', 5]); onKeep(0, ['value', 0]); onKeep(1, ['value', 8]);
          ok('a change from Live (undo, a reloaded value) moves the face and writes nothing', glideSel === 5 && held.map(Boolean).join() === 'false,false,false,false,false,false,false,true' && LIVE.sets === n1, held.map(Boolean).join() + ' ' + glideSel);
          hold(0, 1); ok('the next hold writes from what Live last said', LIVE.vals[10] === 1 && LIVE.sets === n1 + 1, K());
          onKeep(2, ['value', 93.4]); const gj = glideSel; onKeep(0, ['value', 'x']); onKeep(0, ['name', 3]); onKeep(1); onKeep(0, ['value', 34.2]);
          ok('a value off the scale is cut to fit, and anything that is not a value does nothing', gj === 6 && held[1] && !held[0] && !held[2] && !held[3] && held[7], gj + ' ' + held.map(Boolean).join());
          glide(1); ok('and the next change writes a clean number', LIVE.vals[12] === 1, K());
          ready = false; onKeep(2, ['value', 4]); const nr = glideSel; hold(3); const nw = LIVE.vals[10]; hold(3); ready = true;
          ok('nothing is read or written while the rack is not bound', nr === 1 && nw === LIVE.vals[10], nr);
          freeObservers(); const fo = keepApi.length; bindKeep(['id', 100, 'id', 101]); hold(5); const hm = held[4]; hold(5);
          ok('a rack without those macros remembers nothing and still holds', fo === 0 && keepApi.length === 0 && hm !== held[4]);
          bang(); paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | ') + LOG.filter(l => l.indexOf('EXC') >= 0).join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # ---- PULSE: the level tap, the envelope, MIX, the LED and its macro (the fourteenth) ----
        await port("&tap", "ctl-pulse", "(async () => {" + PRE + """
          const W2 = WIRES.map(x => x.join(' ')).join(' | ');
          ok('the tap is patched: both plugin~ outlets into one peakamp~ 33, then prepend level into the face', W2.indexOf('plugin~ 0 peakamp~ 33 0') >= 0 && W2.indexOf('plugin~ 1 peakamp~ 33 0') >= 0 && W2.indexOf('peakamp~ 33 0 prepend level 0') >= 0 && W2.indexOf('prepend level 0 jsui 0') >= 0 && LOG.indexOf('[GLASS] level tap made') >= 0, W2);
          ok('at rest PULSE is on, still, and writes nothing', pulseOn && pulseEnv === 0 && LIVE.sets === 0);
          pending = false; level(1); const e1 = pulseEnv, p1 = pending;
          ok('a full-scale peak lifts the pulse at once and asks for a paint', e1 > 0.75 && e1 < 0.85 && p1, e1);
          pulseT = now() - PULSE_REL; level(0); ok('silence lets it fall to a tenth over the release', Math.abs(pulseEnv / e1 - 0.1) < 0.02, pulseEnv / e1);
          pulseEnv = 0; level(2 * Math.pow(10, -55 / 20)); ok('a peak under the floor reads as nothing', pulseEnv === 0, pulseEnv);
          level('x'); level(); ok('anything that is not a number does nothing', pulseEnv === 0, pulseEnv);
          pulseEnv = 0; setMacro(MIX, 0); paintNow(); pending = false; level(1);
          ok('with MIX at 0 nothing pulses and nothing repaints', pulseAmt(1) === 0 && !pending, pulseAmt(1));
          setMacro(MIX, 63.5); ok('the lift follows MIX on its curve', Math.abs(pulseAmt(1) / pulseEnv - Math.pow(0.5, PULSE_MIXC)) < 0.01, pulseAmt(1) / pulseEnv);
          setMacro(MIX, 127); pulseEnv = 1; paintNow(); paintNow(); const sk = shards.key, si = shards.img;
          ok('the shards are baked once the knobs hold still', !!sk && !!si, sk);
          paintNow(); ok('and kept while they stay still', shards.img === si);
          pending = false; pulseEnv = 0.5; pulseT = now(); level(1); const keep = pending; pending = false; level(1);
          ok('a level that moves the pulse less than a step repaints nothing', keep && !pending);
          const s0 = LIVE.sets; onclick(ledX(), HCY); const off = !pulseOn, v13 = LIVE.vals[13];
          onclick(ledX(), HCY); ok('a click on the LED turns PULSE off and on, written to the fourteenth macro', off && v13 === 1 && pulseOn && LIVE.vals[13] === 0 && LIVE.sets === s0 + 2, v13 + ' ' + LIVE.vals[13]);
          onidle(ledX(), HCY); ok('the LED takes the pointer, and nothing else does there', hoverLed && !hoverBack && !hoverShatter); onidleout(0, 0);
          pulse(0); pending = false; pulseEnv = 0; level(1); ok('with PULSE off nothing repaints', !pending && pulseAmt(1) === 0);
          onKeep(3, ['value', 0]); ok('Live turning the macro back (undo) turns PULSE on', pulseOn);
          LIVE.vals[13] = 1; bang(); ok('a reloaded set with the macro at 1 comes back off', !pulseOn, pulseOn);
          LIVE.vals[13] = 0; bang(); pulseEnv = 1; shT = now(); paintNow(); shT = -1; flickTask.cancel();
          bindKeep(['id', 100, 'id', 101]); ok('a rack without a fourteenth macro still pulses', pulseOn);
          paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | ') + LOG.filter(l => l.indexOf('EXC') >= 0).join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        # ---- the 10-11 audit fixes (audit/2026-10-11-pre-release-audit.md): A1, A2, A6, A4, A5, A3 ----
        await port("", "ctl-bind", "(async () => {" + PRE + """
          const g0 = LiveAPI.prototype.get, n0 = LOG.length, since = s => LOG.slice(n0).filter(l => l.indexOf(s) >= 0).length;
          LiveAPI.prototype.get = function (k) { const v = g0.apply(this, arguments); return k === 'parameters' ? v.slice(0, 14) : v; };   // Device On and six macros
          bang(); ok('A1: a rack showing six of the eight macros does not bind', !ready, ready);
          await nap(2700);
          ok('A1: after the quick tries a half-done bind is still unbound and still looking, warned once', !ready && since('6 of 8 macros') === 1 && since('macros bound=') === 0, LOG.slice(n0).join(' / '));
          await nap(2100); ok('A1: the slow looks go on with no second warning', !ready && since('6 of 8 macros') === 1, LOG.slice(n0).join(' / '));
          LiveAPI.prototype.get = g0; await nap(1200);
          ok('A1: once the rack fills in it binds on a slow look, all eight, once', ready && since('macros bound=8') === 1 && since('bound=6') === 0 && params.length === 9, LOG.slice(n0).join(' / '));
          paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("", "ctl-audit", "(async () => {" + PRE + """
          const SR = shatterRect(), sh = () => { onclick(SR[0] + 5, SR[1] + 5); shT = -1; flickTask.cancel(); };
          LIVE.bpm = 600; glide(4);
          nameClick(1); await nap(150); hold(0, 1); const h0 = vals[0]; await nap(400);
          ok('A2: holding a knob mid-glide stops it where it is, and the rest land', !anim && vals[0] === h0 && h0 > 30 && h0 < 120 && near(vals.slice(1, 8), PRESETS[1].vals.slice(1)), h0);
          nameClick(0); await nap(150); const c0 = vals[0]; sh(); const free0 = anim && anim.free[0]; await nap(450);
          ok('A2: SHATTER mid-glide leaves a held knob where it is now, not at the glide end', !anim && free0 && vals[0] === c0 && Math.abs(c0 - PRESETS[0].vals[0]) > 1, c0 + ' ' + vals[0]);
          hold(0, 0); glide(0); nameClick(1); const n1 = hist.length;
          nameClick(1); ok('A6: loading the lit preset with nothing changed is still not a step', hist.length === n1, hist.length);
          onMacroChanged(0, ['value', 30]); const lit1 = loaded === PRESETS[1] && vals[0] === 30;
          nameClick(1); ok('A6: after a controller moves a knob, loading the lit preset again is a step and puts the preset back', lit1 && hist.length === n1 + 1 && near(vals, PRESETS[1].vals), hist.length + ' ' + n1);
          back(); ok('A6: and BACK returns the sound the controller made', vals[0] === 30 && near(vals.slice(1, 8), PRESETS[1].vals.slice(1)) && loaded === PRESETS[1], vals[0]);
          pulseEnv = 0; pulseT = 0; level(1); const e1 = pulseEnv, E = [];
          for (let i = 0; i < 6; i++) { pulseT = now() - 33; level(1); E.push(pulseEnv); }
          ok('A4: a steady level holds the pulse steady, never attack and decay in turn', e1 > 0.75 && E.every(e => e === e1), [e1].concat(E).map(e => e.toFixed(3)).join());
          pulseTask.cancel(); pulseEnv = 0; await nap(60); ok('A5: at rest no pulse timer runs', !pulseTask.running);
          level(1); const r1 = pulseTask.running; await nap(300); const e2 = pulseEnv;
          ok('A5: when the levels stop the pulse still falls', r1 && e2 < e1 * 0.4 && e2 > 0, e2);
          let t0 = Date.now(); while (pulseEnv && Date.now() - t0 < 3000) await nap(30); await nap(60);
          ok('A5: it reaches rest within the release and the timer stops itself there', pulseEnv === 0 && !pulseTask.running && Date.now() - t0 < 1200, (Date.now() - t0) + ' ms');
          pulse(0); level(1); await nap(400); const off = !pulseTask.running && pulseEnv === e1;
          pulse(1); paintNow(); const back1 = pulseEnv;
          ok('A5: with PULSE off no timer runs, and PULSE back on after the levels stopped falls for the time it was off before it draws', off && back1 < e1 * 0.2 && pulseTask.running, back1);
          t0 = Date.now(); while (pulseTask.running && Date.now() - t0 < 2000) await nap(30);
          setMacro(MIX, 0); level(1); await nap(60); const m0 = !pulseTask.running; setMacro(MIX, 127); paintNow(); t0 = Date.now(); while (pulseTask.running && Date.now() - t0 < 2000) await nap(30);
          level(1); const r2 = pulseTask.running; pulse(0); await nap(80); const r3 = pulseTask.running; pulse(1);
          ok('A5: no timer while MIX is at 0, and a running one stops when PULSE goes off', m0 && r2 && !r3, [m0, r2, r3].join());
          paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("", "ctl-still", "(async () => {" + PRE + """
          let inPaint = 0, nested = 0, sBakes = 0, lBakes = 0, paints = 0, lastKey = shards.key;
          const P0 = paint; paint = function () { inPaint++; paints++; try { P0(); } finally { inPaint--; } if (shards.key !== lastKey) { sBakes++; lastKey = shards.key; } };
          const R0 = mgraphics.redraw; mgraphics.redraw = function () { if (inPaint) nested++; return R0.apply(this, arguments); };
          const B0 = bakeLayer; bakeLayer = function () { lBakes++; return B0.apply(this, arguments); };
          LIVE.bpm = 600; glide(4);
          let feed = setInterval(() => level(0.6 + Math.random() * 1.2), 33);   // music: the level never holds still
          await nap(400); ok('A3: with the knobs still and music playing the shards are baked and drawn', shards.img && shards.key === shards.want && sBakes >= 1, sBakes);
          let s0 = sBakes, l0 = lBakes, p0 = paints; nameClick(1); while (anim) await nap(5);
          const sG = sBakes - s0, lG = lBakes - l0, pG = paints - p0;
          ok('A3: a glide with music playing bakes no shards, and paint asks for no paint', sG === 0 && nested === 0, 'shard bakes ' + sG + ', knob layer bakes ' + lG + ', paints ' + pG + ', redraws from paint ' + nested);
          await nap(300); ok('A3: the shards come back baked once the glide ends', shards.img && shards.key === shards.want && sBakes - s0 === 1, sBakes - s0);
          clearInterval(feed); feed = setInterval(() => level(1), 33); await nap(300);
          s0 = sBakes; nameClick(0); while (anim) await nap(5); p0 = paints; await nap(250); clearInterval(feed);
          ok('A3: with a steady level and nothing else repainting, the shards still come back after a glide, from one paint', shards.img && shards.key === shards.want && sBakes - s0 === 1 && paints - p0 <= 2 && nested === 0, 'bakes ' + (sBakes - s0) + ', paints after the glide ' + (paints - p0));
          paintNow(); ok('no paint errors, nothing posted as an error', PAINT_ERR.length === 0 && LOG.filter(l => l.indexOf('EXC') >= 0).length === 0, PAINT_ERR.join(' | '));
        })().catch(e => (window.R = window.R || []).push(['the pass threw', false, String(e && e.stack || e)]))""")
        await port("&tap", "pulse", "setInterval(() => level(2), 33); 0", wait=900)   # a steady full-scale level from the tap; a level set by hand now falls to rest on its own (A5)
        # the open list beside the mock: stock only, then the mock's five saved presets with the bar
        await mock("?v=a&preset=0&open=0", "list", PMOCK); await port("", "list", "preset(0); onclick(pillX(0, W()) + 54, 30); 0")
        await mock("?v=a&saved=5&preset=1&open=1", "list-saved", PMOCK)
        await port("", "list-saved", """[19, 84, 64, 339, 142].forEach((sd, n) => { const r = rng(sd), pal = palFromHue(r() * 360), seed = (r() * 1e9) | 0, v = []; for (let m = 0; m < 8; m++) v.push(r() * 127);
          bank.push({ id: 'u' + n, name: 'USER ' + (n + 1), vals: v, accent: pal[0], pal: pal, seed: seed }); });
          preset(1); menu = { slot: 1, scroll: 0, arm: false }; mgraphics.redraw(); 0""")
        # the open glide list beside the mock, 1 BAR picked
        await mock("?preset=0&gl=4&gopen=1", "glide-list"); await port("", "glide-list", "preset(0); hist.length = 0; glide(4); gmenu = true; mgraphics.redraw(); 0")
        pg_r = out["interact"]
        try: await asyncio.wait_for(b.close(), 5)
        except Exception: pass
    for name in ["default", "angels", "midnight-hover", "ghosts", "shatter", "list", "list-saved", "glide-list"]:
        a = Image.open(f"{SP}/mock-{name}.png").convert("RGB"); c = Image.open(f"{SP}/port-{name}.png").convert("RGB")
        d = ImageChops.difference(a, c); st = ImageStat.Stat(d)
        big = sum(1 for px in d.convert("L").getdata() if px > 40)
        sheet = Image.new("RGB", (a.width, a.height * 2 + 6), (255, 0, 255)); sheet.paste(a, (0, 0)); sheet.paste(c, (0, a.height + 6)); sheet.save(f"{SP}/pair-{name}.png")
        d.point(lambda v: min(255, v * 4)).save(f"{SP}/diff-{name}.png")
        print(f"{name:16s} size {a.size} vs {c.size}  mean abs diff {sum(st.mean)/3:.2f}/255  pixels off by >40: {big} of {a.width*a.height}")
    a = Image.open(f"{SP}/port-drag.png").convert("RGB"); c = Image.open(f"{SP}/port-drag-nolayer.png").convert("RGB")
    d = ImageChops.difference(a, c); st = ImageStat.Stat(d)
    print(f"knob layer on vs off, same state: mean abs diff {sum(st.mean)/3:.3f}/255  largest {max(e[1] for e in d.getextrema())}")
    for k, v in out.items():
        print(f"\n[{k}] err={v['err']} pageerr={v['pageerr']} unknown={v['unknown']} ready={v['ready']} made={v['made']} freed={v['freed']} trash={v['trash']} sets={v['sets']}")
        for l in v["log"]: print("   ", l)
        if v.get('R'):
            for r in v['R']: print('    R', r)
    print("\nmgraphics methods used (default run):", sorted(out["default"]["calls"].items()))
    rows = [(k, r) for k, v in out.items() if k.startswith(("bank", "ctl")) for r in (v.get("R") or [])]
    bad = [(k, r) for k, r in rows if r[1] is not True]
    dirty = [k for k, v in out.items() if v["err"] or v["pageerr"] or v["unknown"]]
    print(f"\nbank and control checks: {len(rows) - len(bad)} of {len(rows)} passed" + "".join(f"\n  FAILED [{k}] {r[0]}  ({r[2]})" for k, r in bad))
    print(f"runs: {len(out)}, with a paint error, page error or unknown call: {dirty or 'none'}")
asyncio.run(asyncio.wait_for(main(), 480))
