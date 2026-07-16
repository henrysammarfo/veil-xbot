# Speech services

Enterprise bootstrap for Voicebox-compatible TTS + VibeVoice-compatible ASR.

## One command

```bash
# Docker (preferred)
npm run services:up

# Or local Node (no Docker)
npm run services:up:local
```

Then in `.env`:

```bash
VOICEBOX_URL=http://127.0.0.1:8780
VIBEVOICE_ASR_URL=http://127.0.0.1:8780/transcribe
```

## What it does

`services/speech-proxy.mjs` exposes:
- `POST /v1/tts` — Voicebox-shaped TTS (Venice Kokoro behind the scenes)
- `POST /transcribe` — VibeVoice/freecut-shaped ASR (OpenAI Whisper behind the scenes)

So the Magmos stack is production-ready **today** with your existing Venice + OpenAI keys.
When you self-host real jamiepine/voicebox or microsoft/VibeVoice, point the same env URLs at those servers — no code change.

## Health

```bash
curl http://127.0.0.1:8780/health
```

## Stop

```bash
npm run services:down   # docker
# local: Ctrl+C the node process
```
