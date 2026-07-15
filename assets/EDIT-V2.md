# Editor v2

Full automated short-form edit — no CapCut handoff.

## Requirements

- **ffmpeg** + **ffprobe** on PATH (with libass for ASS captions)
- **OPENAI_API_KEY** — Whisper transcription + hook pick (fallback templates work without it)
- Optional: drop SFX in `assets/sfx/*.mp3` for timeline hits
- Optional: drop stock clips in `assets/broll/*.mp4` (otherwise ken-burns from your footage)

## Commands

```bash
# Finished MP4 from any screen recording
npm start edit recording.webm veil loss-receipt

# Full demo → raw capture + edited MP4 in data/exports/
npm run demo veil
```

## Pipeline

1. Whisper word timestamps (or template captions)
2. Silence detect → dead-space trim
3. Manifest from footage (hook, cuts, b-roll slots, SFX cues)
4. ffmpeg render: 9:16, zoom punches, flash frames, speed ramps
5. B-roll overlay (stock or generated ken-burns)
6. ASS cinematic captions burned in
7. SFX mix on timeline

Output: `data/exports/<name>_<project>_<style>_v2.mp4`
