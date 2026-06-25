# Where to download everything (free, no watermark)

One-time setup. Bot auto-finds clips via TinyFish; you download from these links.

---

## Sound effects → `assets/sfx/`

| File | Direct search (free, no account) |
|------|-----------------------------------|
| `whoosh.mp3` | https://pixabay.com/sound-effects/search/whoosh/ |
| `bass-hit.mp3` | https://pixabay.com/sound-effects/search/bass%20impact/ |
| `impact.mp3` | https://pixabay.com/sound-effects/search/cinematic%20hit/ |
| `rise.mp3` | https://pixabay.com/sound-effects/search/riser/ |
| `glitch.mp3` | https://pixabay.com/sound-effects/search/glitch/ |
| `ding.mp3` | https://pixabay.com/sound-effects/search/notification/ |
| `camera-click.mp3` | https://pixabay.com/sound-effects/search/camera%20shutter/ |
| `keyboard.mp3` | https://pixabay.com/sound-effects/search/keyboard/ |

**Steps:** open link → pick 0.5–1s clip → Download MP3 → rename → drop in `veil-xbot/assets/sfx/`

---

## Music (no watermark) — seasoned editor picks

| Use case | Where | What to search |
|----------|-------|----------------|
| **Crypto TikTok / hype** | https://pixabay.com/music/search/phonk/ | phonk drift 140bpm |
| **Loss reveal / drama** | https://pixabay.com/music/search/cinematic%20dark/ | dark cinematic sting |
| **Build in public** | https://pixabay.com/music/search/lo-fi/ | lo-fi minimal 90–100bpm |
| **Custom unique** | https://suno.com (free credits) | paste prompt from `npm run music veil` |

**Editor rule:** music **under** SFX. Duck music -12dB on bass-hit. Bot writes BPM in manifest — match cuts to beat.

Save as `assets/music/beat.mp3` — bot mixes on render when present.

---

## B-roll clips (NO Kling/HeyGen watermark)

Bot finds URLs: `npm run clips 10 trading`

You download from bot results:

| Site | License | Link |
|------|---------|------|
| **Pexels** | Free, no watermark | https://www.pexels.com/search/videos/crypto/ |
| **Pixabay video** | Free, no watermark | https://pixabay.com/videos/search/technology/ |
| **Coverr** | Free, no watermark | https://coverr.co/stock-video-footage/technology |

Save to `assets/broll/` as `clip1.mp4`, `clip2.mp4`. Bot manifest says which slot uses which.

**Do NOT use** Kling/HeyGen/Hyperframes free exports on X — watermarks kill credibility. Screen recording + Pexels b-roll only until you pay.

---

## ffmpeg (video render)

Windows: https://www.gyan.dev/ffmpeg/builds/ → `ffmpeg-release-essentials.zip` → add `bin` to PATH

Test: `ffmpeg -version`

---

## Optional (skip if broke)

| Tool | Watermark on free? | Use? |
|------|-------------------|------|
| Kling | Yes | **No** — bot queues prompt only for reference |
| HeyGen | Yes | **No** |
| Hyperframes | Often yes | **No** |
| Suno | No on audio | **Yes** for unique beats |
| Pexels/Pixabay | **No** | **Yes** — default b-roll |

---

## After download

```bash
npm run clips 8 crypto          # bot finds clip URLs
npm run launch veil             # full pack uses watermark-free stack
npm run edit demo.mp4 veil loss-receipt
```
