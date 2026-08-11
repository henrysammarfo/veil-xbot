# Cinematic craft — Higgsfield community standards × Venice execution

Sources (open community craft; **no Higgsfield SaaS key required** — Venice runs the pixels):

| Source | Role |
|--------|------|
| [OSideMedia/higgsfield-ai-prompt-skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill) | MCSLA, ban lists, I2V rules |
| [pixelab-ch/higgsfield-skills](https://github.com/pixelab-ch/higgsfield-skills) | Motion ads, social hooks, brand story |
| [NatiDvir/video-skills](https://github.com/NatiDvir/video-skills) | Director + Seedance patterns |
| [higgsfield-ai/skills](https://github.com/higgsfield-ai/skills) | Official generate/soul/photoshoot skills |
| Goose (`.agents/skills`) | GTM / ads / mockups execution |

## MCSLA (every Venice T2V/I2V prompt)

| | |
|--|--|
| **M**odel | Venice model via `VENICE_VIDEO_MODEL` (Seedance-class) |
| **C**amera | Named move (Dolly In, Crane Up, handheld POV…) |
| **S**ubject | Who/what + appearance |
| **L**ook | Light, grade, materials |
| **A**ction | One primary action |

Rules kiln enforces in `src/studio/cinematic-craft.ts`:

1. Lead with Subject + Action in first ~25 words  
2. One primary action per clip; in medias res  
3. Kill slop words (beautiful, stunning, epic, 8k…)  
4. I2V: describe only what *moves*  
5. Magmos public voice — no forge/smelt/APY  
6. Iterate one variable when regenerating  

## 3-key stack

```
VENICE_API_KEY   → video, image, TTS, text, presenter
OPENAI_API_KEY   → cascade text, Whisper ASR, image fallback
TINYFISH_API_KEY → site research before ads
+ ffmpeg on PATH → assemble masters (system install — not a key)
```

## Self-improve (research harness)

See `src/brain/evolve.ts` — Reflexion-style rules, scored lessons, memory prune (MemCon/SelfMem patterns, no weight training).

```bash
npm run activate
npm run caps
npm run fleet https://yoursite.com
```
