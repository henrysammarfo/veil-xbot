# API roadmap — when you have budget

## Buy order (recommended)

| Priority | API | For | Env key | ~Cost |
|----------|-----|-----|---------|-------|
| 1 | **FAL.ai** | Flux posters + AI video clips | `FAL_API_KEY` | Pay per gen |
| 2 | **HeyGen** | AI avatar UGC ads (office guy, dialogue) | `HEYGEN_API_KEY` | Subscription |
| 3 | **Kling** | Cinematic b-roll, no watermark on paid | `KLING_API_KEY` | Credits |
| 4 | **Hyperframes** | Speed ramps on screen recordings | `HYPERFRAMES_API_KEY` | Credits |
| 5 | **ElevenLabs** | VO for trailers | `ELEVENLABS_API_KEY` | Chars/mo |

## Already wired in bot

| Key set | What activates |
|---------|----------------|
| `FAL_API_KEY` | `poster` uses Flux instead of DALL-E; `produce` queues FAL video |
| `HEYGEN_API_KEY` | `produce` queues avatar scenes with dialogue |
| `KLING_API_KEY` | `produce` queues b-roll |
| `HYPERFRAMES_API_KEY` | Motion on exports |

## MCP (Cursor cloud)

When you have cloud space:
- TinyFish MCP — already available for Cursor research
- Browser MCP — agent can watch TikTok/YouTube for learnings
- Point agent at `npm run autolearn` on schedule

## Field.io

Cinematic AI video — add `FIELD_API_KEY` when budget allows (stub in future).

## Free stack (today)

`OPENAI` + `TINYFISH` + `playwright` + Pexels + Suno web + ffmpeg

Target: **70–75%** of paid quality. Honest.

## Sandbox credentials

```env
SANDBOX_TEST_EMAIL=
SANDBOX_TEST_PASSWORD=
VEIL_DEMO_URL=https://veil-reviewer.vercel.app
```

Bot tests all viewports before generating demo videos.
