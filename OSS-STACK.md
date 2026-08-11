# Magmos / kiln — OSS stack (fully wired)

## 3 keys only (your production stack)

| Key | Covers |
|-----|--------|
| `VENICE_API_KEY` | Text, image, TTS, T2V video, presenter PiP |
| `OPENAI_API_KEY` | Text cascade, Whisper ASR, image fallback |
| `TINYFISH_API_KEY` | Site research for link-drop fleet |

**System (not a key):** `ffmpeg` on PATH — installed once for edit/hyperframes/montage masters.

With the triple keys + ffmpeg + `npm run activate`, cascade status should be **wired** (not "half skill"). Remaining "partial" only if a key or ffmpeg is missing.

```bash
npm run activate
npm run caps              # honest capability report
npm run fleet https://yoursite.com   # link → full fleet
```

Film language: Higgsfield community MCSLA craft on Venice — see **knowledge/HIGGSFIELD-CRAFT.md**.
Goose GTM skills: `.agents/skills` (268+) — see below.

---

All items execute via `npm run activate`, `npm run pack`, `npm run oss-wire`, or dedicated CLI commands.
Skills live **flat** under `.agents/skills/<slug>/`. Vendor pointer: `vendor/goose-skills/ROOT.txt`.

```bash
npm run activate          # bootstrap paths + adopt skills + goldmine + craft + evolve
npm run activate -- --full  # + OpenMontage wire
npm run oss-stack         # live wired table + async health
npm run pack magmos       # includes OSS wire, montage, HeyGen when keyed
```

## Live map

| Repo | Status | Executes when… | Command |
|------|--------|----------------|---------|
| [goose-skills](https://github.com/gooseworks-ai/goose-skills) | wired | flat `.agents/skills` + `formats.json` | `npm run activate` / `stack` / `ad-maker` |
| Higgsfield craft (community) | wired | MCSLA prompts → Venice T2V | pack thriller / fleet |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | wired | walkthrough / pack thriller | `npm run walkthrough magmos` |
| ad-maker (Branda pattern) | wired | TinyFish + goose-stack | `npm run ad-maker magmos` |
| freecut-style editor | wired | `edit-auto` | `npm run edit-auto recording.mp4 magmos` |
| [Diffusion Studio](https://github.com/diffusionstudio/editor) | **wired** | Agent TSX → dapi mount/render · pack step 5b2 | `npm run dse magmos` |
| openshorts-style clips | wired | moment → 9:16 | `npm run shorts recording.mp4` |
| web-to-app pack | wired | APK builder config | `npm run web-to-app magmos` |
| OpenMontage | wired | auto-footage → edit → shorts | `npm run openmontage magmos` |
| Voicebox | wired | Voicebox **or** Venice/OpenAI TTS | edit-auto / pack |
| VibeVoice ASR | wired | VibeVoice **or** Whisper | edit-auto |
| HeyGen | wired | HeyGen **or** Venice presenter | pack when Venice set |
| open-source-ai-goldmine | wired | catalog + adoption | `npm run goldmine` |

## Path resolution

1. `GOOSE_SKILLS_ROOT` env  
2. `vendor/goose-skills/ROOT.txt`  
3. Sibling/desktop goose clone  
4. Fallback: `kiln/.agents/skills`

## Env

```bash
VENICE_API_KEY=
OPENAI_API_KEY=
TINYFISH_API_KEY=
OPENMONTAGE_AUTO=1
HEYGEN_AUTO=0
EDIT_ENGINE=venice,openai,fal
```

## Fleet (drop a link)

```bash
npm run fleet https://magmoslabs.vercel.app
# research → ads → Venice thriller (MCSLA) → site ads → UGC → ops → quality → evolve
```
