"""Draw the 16x16 wand icons. Run: python3 art/draw_icons.py <out_dir>"""
import sys
from PIL import Image

PAL = {
    "B": (74, 46, 24), "b": (122, 80, 44),          # wood dark / light
    "G": (250, 200, 60), "g": (190, 140, 30),        # gold / dark gold
    "S": (190, 190, 196), "s": (128, 128, 138),      # stone light / dark
    "W": (70, 150, 230), "w": (150, 210, 255),       # window
    "K": (34, 30, 38), "k": (70, 62, 78),            # bomb / bomb highlight
    "I": (165, 170, 178), "i": (98, 102, 110),       # iron light / dark
    "R": (210, 40, 40), "r": (140, 20, 25),          # red / dark red
    "O": (255, 140, 30), "Y": (255, 235, 90),        # spark
}

def rod(px, light, dark, band, pommel):
    # Diagonal handle from the head (top right) to the bottom left.
    for i in range(8):
        x, y = 9 - i, 8 + i
        c1, c2 = (band, band) if i in (2, 3) else (light, dark)
        if i == 7:
            c1 = c2 = pommel
        px[(x, y)] = c1
        px[(x + 1, y)] = c2

def tower_wand():
    px = {}
    rod(px, "b", "B", "G", "G")
    for x in (8, 10, 12, 14):
        px[(x, 0)] = "S"
    for x in range(8, 15):
        px[(x, 1)] = "s" if x in (8, 14) else "S"
        for y in range(2, 6):
            px[(x, y)] = "s" if x in (8, 14) else "S"
        px[(x, 6)] = "G"
    for x in (10, 12):
        px[(x, 2)] = "w"
        px[(x, 3)] = "W"
    px[(11, 4)] = "B"
    px[(11, 5)] = "B"
    for x in range(9, 14):
        px[(x, 7)] = "g"
    return px

def blast_wand():
    px = {}
    rod(px, "I", "i", "R", "r")
    cx, cy = 11.5, 4.5
    for x in range(7, 16):
        for y in range(0, 9):
            d = (x - cx) ** 2 + (y - cy) ** 2
            if d <= 10.5:
                px[(x, y)] = "K"
    px[(10, 3)] = "k"; px[(10, 4)] = "k"; px[(11, 3)] = "k"
    px[(13, 1)] = "B"; px[(14, 0)] = "O"; px[(15, 0)] = "Y"; px[(15, 1)] = "O"; px[(13, 0)] = "Y"
    for x in range(9, 13):
        px[(x, 8)] = "R"
    return px

def save(px, path, scale=1):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for (x, y), c in px.items():
        if 0 <= x < 16 and 0 <= y < 16:
            img.putpixel((x, y), PAL[c] + (255,))
    if scale > 1:
        img = img.resize((16 * scale, 16 * scale), Image.NEAREST)
    img.save(path)

if __name__ == "__main__":
    out = sys.argv[1]
    save(tower_wand(), f"{out}/tower_wand.png")
    save(blast_wand(), f"{out}/blast_wand.png")
    if len(sys.argv) > 2:  # preview dir
        prev = Image.new("RGBA", (16 * 16 * 2 + 16, 16 * 16), (60, 60, 60, 255))
        for i, f in enumerate((tower_wand, blast_wand)):
            save(f(), f"{sys.argv[2]}/p{i}.png", 16)
            prev.paste(Image.open(f"{sys.argv[2]}/p{i}.png"), (i * (256 + 16), 0))
        prev.save(f"{sys.argv[2]}/preview.png")
