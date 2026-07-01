from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import ImageSequenceClip


W, H = 1080, 1350
FPS = 30
DURATION = 15.0

BG = (245, 248, 252)
NAVY = (15, 23, 42)
BLUE = (37, 99, 235)
TEAL = (20, 184, 166)
MUTED = (71, 85, 105)
WHITE = (255, 255, 255)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
  candidates = [
      "C:/Windows/Fonts/Inter-Bold.ttf" if bold else "C:/Windows/Fonts/Inter-Regular.ttf",
      "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
      "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
  ]
  for font_path in candidates:
    p = Path(font_path)
    if p.exists():
      return ImageFont.truetype(str(p), size=size)
  return ImageFont.load_default()


def ease_out(t: float) -> float:
  t = max(0.0, min(1.0, t))
  return 1.0 - (1.0 - t) ** 3


def alpha_for_scene(local_t: float, scene_dur: float, fade: float = 0.35) -> int:
  fade = min(fade, scene_dur / 2)
  if local_t < fade:
    return int(255 * ease_out(local_t / fade))
  if local_t > scene_dur - fade:
    return int(255 * ease_out((scene_dur - local_t) / fade))
  return 255


def draw_centered(draw: ImageDraw.ImageDraw, text: str, y: int, font: ImageFont.FreeTypeFont, fill: Tuple[int, int, int], alpha: int = 255):
  bbox = draw.textbbox((0, 0), text, font=font)
  tw = bbox[2] - bbox[0]
  draw.text(((W - tw) / 2, y), text, font=font, fill=(*fill, alpha))


def make_frame(t: float, logo: Image.Image):
  img = Image.new("RGBA", (W, H), BG + (255,))
  overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
  d = ImageDraw.Draw(overlay)

  title_font = load_font(74, bold=True)
  sub_font = load_font(42, bold=False)
  small_font = load_font(34, bold=False)
  cta_font = load_font(40, bold=True)

  # Scene timing
  scenes = [
      (0.0, 2.0, "Shipping labels, simplified.", ""),
      (2.0, 5.0, "Generate labels in seconds.", "Single + Bulk workflows"),
      (5.0, 8.0, "Track every parcel with confidence.", ""),
      (8.0, 11.0, "Powerful admin visibility.", "Warehouses, users, parcel volume"),
      (11.0, 13.5, "Built for scale. Designed for control.", ""),
      (13.5, 15.0, "Start with LABEL FLOW", "Book a Demo"),
  ]

  active = scenes[-1]
  for s in scenes:
    if s[0] <= t < s[1]:
      active = s
      break

  s0, s1, headline, sub = active
  local_t = t - s0
  alpha = alpha_for_scene(local_t, s1 - s0)

  # Light background cards / motif
  d.rounded_rectangle((80, 250, W - 80, H - 220), radius=36, fill=(255, 255, 255, 240), outline=(226, 232, 240, 255), width=2)
  d.line((120, H - 280, W - 120, H - 280), fill=(226, 232, 240, 255), width=2)

  # Top brand strip
  d.rectangle((0, 0, W, 120), fill=(NAVY[0], NAVY[1], NAVY[2], 255))
  d.rectangle((0, 114, W, 120), fill=(BLUE[0], BLUE[1], BLUE[2], 255))
  d.text((40, 36), "LABEL FLOW", font=load_font(34, bold=True), fill=(255, 255, 255, 255))

  # Logo center
  logo_size = 190
  logo_r = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
  logo_alpha = int(alpha * 0.95)
  if logo_r.mode != "RGBA":
    logo_r = logo_r.convert("RGBA")
  logo_r.putalpha(logo_alpha)
  img.alpha_composite(logo_r, (int((W - logo_size) / 2), 340))

  # Headline + subtext
  draw_centered(d, headline, 585, title_font, NAVY, alpha=alpha)
  if sub:
    draw_centered(d, sub, 690, sub_font, MUTED, alpha=alpha)

  # Decorative KPI bars
  prog = ease_out((t % 2.0) / 2.0)
  d.rounded_rectangle((160, H - 175, W - 160, H - 145), radius=16, fill=(226, 232, 240, 255))
  d.rounded_rectangle((160, H - 175, int(160 + (W - 320) * prog), H - 145), radius=16, fill=(TEAL[0], TEAL[1], TEAL[2], 220))
  draw_centered(d, "Real-time operations visibility", H - 125, small_font, MUTED, alpha=220)

  # CTA button on final scene
  if t >= 13.5:
    btn_w, btn_h = 320, 78
    x0 = (W - btn_w) // 2
    y0 = 1020
    d.rounded_rectangle((x0, y0, x0 + btn_w, y0 + btn_h), radius=20, fill=(BLUE[0], BLUE[1], BLUE[2], min(255, alpha + 20)))
    draw_centered(d, "Book a Demo", y0 + 18, cta_font, WHITE, alpha=alpha)

  img = Image.alpha_composite(img, overlay).convert("RGB")
  return np.array(img)


def main():
  root = Path(__file__).resolve().parents[1]
  logo_path = root / "client" / "build" / "LABELFLOW-social-logo.png"
  if not logo_path.exists():
    logo_path = root / "client" / "build" / "logo512.png"

  logo = Image.open(logo_path).convert("RGBA")
  frames = [make_frame(i / FPS, logo) for i in range(int(DURATION * FPS))]

  out_dir = root / "media"
  out_dir.mkdir(parents=True, exist_ok=True)
  out_file = out_dir / "LABELFLOW-meta-ad-15s.mp4"

  clip = ImageSequenceClip(frames, fps=FPS)
  clip.write_videofile(str(out_file), codec="libx264", audio=False, preset="medium", fps=FPS)
  print(out_file)


if __name__ == "__main__":
  main()
