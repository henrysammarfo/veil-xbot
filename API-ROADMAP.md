# API roadmap — when you have budget

## Buy order (recommended)

| Priority | API | For | Env key | ~Cost |
|----------|-----|-----|---------|-------|
| 1 | **FAL.ai** | Flux posters + AI video clips | `FAL_API_KEY` | Pay per gen |
| 2 | **HeyGen** | Video Agent avatar UGC | `HEYGEN_API_KEY` or MCP OAuth | Subscription |
| 3 | **Kling** | Cinematic b-roll | `KLING_API_KEY` | Credits |
| 4 | **ElevenLabs** | VO for trailers | `ELEVENLABS_API_KEY` | Chars/mo |

**HyperFrames** — no purchase needed (OSS). Set `HYPERFRAMES_AUTO=1` or `npm start hyperframes`.

## Already wired in bot

| Key / flag | What activates |
|------------|----------------|
| `FAL_API_KEY` | `poster` uses Flux |
| `HEYGEN_API_KEY` | `heygen` CLI + `HEYGEN_AUTO=1` on produce |
| HeyGen MCP OAuth | `.cursor/mcp.json` → Connect in Settings → MCP |
| `HYPERFRAMES_AUTO=1` | Trailer scaffold → `data/exports/hyperframes-*` |
| `FLOCKAI_*` | Locked prompts via `src/ai/router.ts` |
| `SUI_NETWORK` + sandbox | Wallet + testnet faucet before demo videos |

See **INTEGRATIONS.md** for real endpoints (v3 video-agents, HyperFrames CLI, MCP URL).

## MCP (Cursor)

| Server | URL | Auth |
|--------|-----|------|
| HeyGen | `https://mcp.heygen.com/mcp/v1/` | OAuth |
| TinyFish | (your existing MCP) | API key |
| Browser | cursor-ide-browser | built-in |

HyperFrames skill: `npx skills add heygen-com/hyperframes`

## Free stack (today)

`OPENAI` + `TINYFISH` + `playwright` + `@mysten/sui` faucet + Pexels + ffmpeg + HyperFrames OSS

Target: **70–75%** of paid quality. Honest.

## Sandbox flow

```bash
npm run wallet veil          # address + fund testnet SUI
npm run sandbox veil         # must pass before produce demo
npm run produce veil trailer "feature"
```

```env
SANDBOX_WALLET=1
SUI_NETWORK=testnet
VEIL_DEMO_URL=https://veil-reviewer.vercel.app
SANDBOX_DUSDC_FAUCET_URL=https://tally.so/r/Xx102L
```
