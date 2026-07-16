# Magmos / veil-xbot — OSS stack (fully wired)

All items below execute in `npm run pack`, `npm run oss-wire`, or dedicated CLI commands.
Local services (Voicebox, VibeVoice) are optional — Venice TTS and Whisper ASR are the runtime fallbacks.

```bash
npm run oss-stack    # live wired table + async health
npm run oss-wire magmos   # goldmine + OpenMontage + probes (full wire)
npm run pack magmos  # includes OSS wire, montage, HeyGen when keyed
```

## Live map

| Repo | Status | Executes when… | Command |
|------|--------|----------------|---------|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | wired | walkthrough / pack thriller / video-format HF scaffold | `npm run walkthrough magmos` |
| [goose-skills](https://github.com/gooseworks-ai/goose-skills) | wired | `AD_ENGINE=stack` remix + create-*-mockup video formats | `npm run stack` / `npm run ad-maker magmos` |
| ad-maker (Branda pattern) | wired | TinyFish + goose-stack (not their SaaS binary) | `npm run ad-maker magmos` |
| freecut-style editor | wired | `edit-auto` filler/EDL/self-eval | `npm run edit-auto recording.mp4 magmos` |
| openshorts-style clips | wired | moment → 9:16 | `npm run shorts recording.mp4` |
| web-to-app pack | wired | writes APK builder config | `npm run web-to-app magmos` |
| OpenMontage | **wired** | auto-footage (discover → synthesize) → edit-auto → shorts → ads | `npm run openmontage magmos` |
| Voicebox | **wired** | Voicebox local **or** Venice/OpenAI TTS cascade | `npm run edit-auto recording.mp4 magmos` |
| VibeVoice ASR | **wired** | VibeVoice endpoint **or** Whisper fallback | `npm run edit-auto recording.mp4 magmos` |
| HeyGen | **wired** | HeyGen Video Agent **or** Venice presenter PiP | `HEYGEN_AUTO=1 npm run pack magmos` |
| open-source-ai-goldmine | **wired** | catalog + adoption map + pack step 0b | `npm run goldmine` |

## Env

```bash
OPENMONTAGE_AUTO=1          # pack step 5b — default on
HEYGEN_AUTO=1               # pack step 5c when HEYGEN_API_KEY set
VOICEBOX_URL=               # optional — local voicebox.sh
VIBEVOICE_ASR_URL=          # optional — freecut-style ASR endpoint
TRANSCRIBE_BACKEND=whisper  # vibevoice tried first when URL set
```

## Edit-on-reference (FAL alternate)

Goose Phase 2B cascade — **no GooseWorks credits**:

1. **Venice** `POST /image/edit` (default)
2. **OpenAI** `images/edits` if `OPENAI_API_KEY`
3. **FAL** `gpt-image-1/edit-image` if `FAL_API_KEY`
4. HTML finish on Goose reference plate (always available)

```bash
EDIT_ENGINE=venice,openai,fal
VENICE_EDIT_MODEL=qwen-edit
```

## Pack flow (11 steps)

0. Unified OS + **0b OSS wire** (goldmine activation + probes)  
1. TinyFish research  
2. Thriller  
3. Ad-maker (Goose stack)  
3b. Video formats (imessage / chatgpt / apple-notes)  
4. X post  
5. UGC influencer  
**5b. OpenMontage** (auto-footage)  
**5c. HeyGen** (when keyed)  
6. Engage  
7. Paid floors  
8. Smart critique + learn  

```bash
npm run pack magmos
```
