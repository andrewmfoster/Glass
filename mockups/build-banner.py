#!/usr/bin/env python3
# Builds the GLASS GitHub social banner (1280x640) by compositing the real raster
# icon (icon/glass-icon-1024.png). The old build-banner.js procedural generator is
# obsolete now that the icon is a ChatGPT raster we can't reproduce vectorially.
#
# Layout: blurred+darkened icon as an atmospheric full-bleed backdrop, the crisp
# icon tile on the left, GLASS wordmark + subtitle on the right.
#
# usage: python3 build-banner.py  ->  writes ../icon/glass-social-banner.png
import os
from PIL import Image, ImageFilter, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(HERE, "..", "icon", "glass-icon-1024.png")
OUT  = os.path.join(HERE, "..", "icon", "glass-social-banner.png")

W, H = 1280, 640
RADIUS = 44
ARIAL_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
ARIAL       = "/System/Library/Fonts/Supplemental/Arial.ttf"

GLOW = (150, 26, 48)      # crimson glow pulled from the icon's accent

icon = Image.open(ICON).convert("RGBA")

# --- base slab ---------------------------------------------------------------
banner = Image.new("RGBA", (W, H), (8, 7, 10, 255))

# --- atmospheric backdrop: icon scaled to cover, heavily blurred + darkened ---
cover = icon.resize((W, W))                                  # scale up, square
cover = cover.crop((0, (W - H) // 2, W, (W - H) // 2 + H))   # center-crop to 2:1
cover = cover.filter(ImageFilter.GaussianBlur(40))
dark = Image.new("RGBA", (W, H), (0, 0, 0, 175))             # scrim
cover = Image.alpha_composite(cover, dark)
banner = Image.alpha_composite(banner, cover)

# --- crisp icon tile on the left --------------------------------------------
TILE = 460
tile = icon.resize((TILE, TILE), Image.LANCZOS)
tx, ty = 78, (H - TILE) // 2
# soft drop glow behind the tile
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.rounded_rectangle([tx - 14, ty - 14, tx + TILE + 14, ty + TILE + 14],
                     radius=70, fill=(*GLOW, 120))
glow = glow.filter(ImageFilter.GaussianBlur(30))
banner = Image.alpha_composite(banner, glow)
banner.paste(tile, (tx, ty), tile)

# --- text block on the right -------------------------------------------------
def spaced_width(font, text, tracking):
    return sum(font.getbbox(c)[2] - font.getbbox(c)[0] + tracking
               for c in text) - tracking

def draw_spaced(d, xy, text, font, fill, tracking):
    x, y = xy
    for c in text:
        d.text((x, y), c, font=font, fill=fill)
        b = font.getbbox(c)
        x += (b[2] - b[0]) + tracking

def wrap(font, text, tracking, max_w):
    """Greedy word-wrap so each line's spaced width fits max_w."""
    out, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if not cur or spaced_width(font, trial, tracking) <= max_w:
            cur = trial
        else:
            out.append(cur); cur = word
    if cur:
        out.append(cur)
    return out

tex = tx + TILE + 64                        # text left (= ink left for the whole stack)
panel_w = W - tex - 72                       # room to the right margin

# Text portion styled after the Surfacer banner: a big-bold tagline, a muted sub-line,
# a colour-coded legend (the presets), and a tech pill + Claude Code credit. No wordmark
# — the icon already carries the GLASS name.
tag_font  = ImageFont.truetype(ARIAL_BLACK, 33)
sub_font  = ImageFont.truetype(ARIAL, 18)
leg_font  = ImageFont.truetype(ARIAL_BLACK, 13)
pill_font = ImageFont.truetype(ARIAL_BLACK, 13)
vibe_font = ImageFont.truetype(ARIAL, 14)

WHITE   = (246, 244, 242)        # tagline
SUBCOL  = (151, 151, 158)        # sub-line  (~0.55 white)
LEGCOL  = (166, 163, 168)        # legend labels (~0.62 white)
PILLTX  = (182, 178, 182)        # pill text (~0.68 white)
VIBECOL = (120, 114, 120)        # credit (~0.42 white)

TAGLINE = "An original Ableton rack + a custom Max for Live face."
SUBLINE = ("Drives the rack’s 8 macros from a bespoke shattered-glass panel — "
           "with 3 preset snapshots and a reactive header that lights up with the sound.")
LEGEND  = [("MIDNIGHT", (77, 141, 240)), ("ANGELS", (210, 143, 245)),
           ("GHOSTS", (102, 219, 153)), ("SHATTER", (207, 226, 255))]
PILL    = "Max for Live  ·  jsui  ·  LOM"
VIBE    = "Vibe-coded with Claude Code"

def th(f):
    a, d = f.getmetrics(); return a + d

TAG_LH, SUB_LH = int(tag_font.size * 1.16), int(sub_font.size * 1.42)
tag_lines = wrap(tag_font, TAGLINE, 0, panel_w)
sub_lines = wrap(sub_font, SUBLINE, 0, panel_w)
leg_h, pill_h = th(leg_font), th(pill_font) + 14
GAP_SUB, GAP_LEG, GAP_FOOT = 18, 28, 30

# center the whole text block vertically
total = (len(tag_lines) * TAG_LH + GAP_SUB + len(sub_lines) * SUB_LH
         + GAP_LEG + leg_h + GAP_FOOT + pill_h)
y = (H - total) // 2

draw = ImageDraw.Draw(banner)

# tagline — big bold white
for ln in tag_lines:
    draw.text((tex, y), ln, font=tag_font, fill=WHITE); y += TAG_LH
y += GAP_SUB

# sub-line — muted, wrapped
for ln in sub_lines:
    draw.text((tex, y), ln, font=sub_font, fill=SUBCOL); y += SUB_LH
y += GAP_LEG

# legend — colour-coded dots + uppercase labels (the presets + SHATTER)
lx, cy = tex, y + int(leg_h * 0.46)
for label, col in LEGEND:
    draw.ellipse([lx, cy - 4, lx + 9, cy + 5], fill=col)
    lx += 9 + 9
    draw_spaced(draw, (lx, y), label, leg_font, LEGCOL, 1)
    lx += spaced_width(leg_font, label, 1) + 24
y += leg_h + GAP_FOOT

# foot — a tech pill + the Claude Code credit
pw = spaced_width(pill_font, PILL, 0)
pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(pill).rounded_rectangle([tex, y, tex + pw + 28, y + pill_h],
        radius=pill_h // 2, fill=(255, 255, 255, 11), outline=(255, 255, 255, 36), width=1)
banner = Image.alpha_composite(banner, pill)
draw = ImageDraw.Draw(banner)
draw_spaced(draw, (tex + 14, y + 7), PILL, pill_font, PILLTX, 0)
draw.text((tex + pw + 28 + 16, y + (pill_h - th(vibe_font)) // 2), VIBE, font=vibe_font, fill=VIBECOL)

# --- top sheen ---------------------------------------------------------------
sheen = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(sheen)
for yy in range(H // 2):
    a = int(30 * (1 - yy / (H / 2)) ** 2)
    sd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
banner = Image.alpha_composite(banner, sheen)

# --- rounded-corner mask -----------------------------------------------------
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=RADIUS, fill=255)
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
out.paste(banner, (0, 0), mask)

out.convert("RGB").save(OUT, "PNG")
print("wrote", OUT, out.size)
