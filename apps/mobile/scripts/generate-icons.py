"""Generate the Android app icons from the desktop app's icon.

    python scripts/generate-icons.py [path/to/desktop/icon.png]

Needs Pillow. The desktop icon is a full-bleed navy square with a white globe. Android wants:
  - icon.png                        1024 square, the full desktop artwork (legacy launchers, store)
  - android-icon-background.png     solid navy (adaptive icon background layer)
  - android-icon-foreground.png     the white globe on transparency, inside the adaptive safe zone
  - android-icon-monochrome.png     the same globe shape for Android 13+ themed icons
  - splash-icon.png                 the globe on transparency for the splash screen
The globe is separated from the background by distance from the background colour, so anti-aliased
edges keep their softness. Source is 512px, so the 1024 outputs are upscaled.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "R:/TrueTunes/icon.png")
OUT = Path(__file__).resolve().parent.parent / "assets"
SIZE = 1024
# Android's adaptive icon safe zone is a 66dp circle inside a 108dp canvas (~61%); keep the globe inside it.
GLOBE_DIAMETER = int(SIZE * 0.58)

src = Image.open(SRC).convert("RGBA")
bg = src.getpixel((2, 2))[:3]

# Alpha = how far each pixel is from the background towards white.
diff = ImageChops.difference(src.convert("RGB"), Image.new("RGB", src.size, bg)).convert("L")
# Distance of pure white from the background, measured the same way (luminance) as the per-pixel diff.
white_dist = (
    ImageChops.difference(Image.new("RGB", (1, 1), (255, 255, 255)), Image.new("RGB", (1, 1), bg))
    .convert("L")
    .getpixel((0, 0))
) or 1
mask = diff.point(lambda v: min(255, int(v * 255 / white_dist)))

# Crop to the globe and scale it into the safe zone on a transparent canvas.
box = mask.getbbox()
globe_mask = mask.crop(box)
w, h = globe_mask.size
scale = GLOBE_DIAMETER / max(w, h)
globe_mask = globe_mask.resize((round(w * scale), round(h * scale)), Image.LANCZOS)


def on_canvas(shape_mask: Image.Image, canvas: int = SIZE) -> Image.Image:
    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    white = Image.new("RGBA", shape_mask.size, (255, 255, 255, 255))
    white.putalpha(shape_mask)
    layer.alpha_composite(white, ((canvas - shape_mask.width) // 2, (canvas - shape_mask.height) // 2))
    return layer


OUT.mkdir(exist_ok=True)
src.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(OUT / "icon.png")
Image.new("RGBA", (SIZE, SIZE), (*bg, 255)).save(OUT / "android-icon-background.png")
foreground = on_canvas(globe_mask)
foreground.save(OUT / "android-icon-foreground.png")
foreground.save(OUT / "android-icon-monochrome.png")
on_canvas(globe_mask).save(OUT / "splash-icon.png")

print("background colour: #%02x%02x%02x" % bg)
print("wrote:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))
