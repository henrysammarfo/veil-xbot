# Integrations — researched from official docs (not guesses)

## HeyGen Video Agent API v3

- Docs: https://developers.heygen.com/docs/quick-start
- Base: `https://api.heygen.com` · Auth: `X-Api-Key: $HEYGEN_API_KEY`
- Flow:
  1. `POST /v3/video-agents` `{ "prompt": "..." }` → `session_id`
  2. Poll `GET /v3/video-agents/{session_id}` until `video_id`
  3. Poll `GET /v3/videos/{video_id}` until `status === "completed"` → `video_url`
- Wired: `src/integrations/heygen.ts`, CLI `npm start heygen "prompt"`
- Auto on produce: `HEYGEN_AUTO=1` when avatar dialogue present

### HeyGen MCP (no API key)

- **Project config:** `.cursor/mcp.json` (already added — reload Cursor after pull)
- **One-click:** https://cursor.com/marketplace/heygen
- URL: `https://mcp.heygen.com/mcp/v1/`
- OAuth: Cursor Settings → MCP → **heygen** → **Connect** (first tool use opens browser)
- Tools: `create_video_agent`, `get_video_agent_session`, `get_video`, `list_voices`, etc.
- Docs: https://developers.heygen.com/mcp/cursor
- Agent rule: `.cursor/rules/heygen-mcp.mdc`
## Installed agent skills

Restore on a fresh clone:

```bash
cd veil-xbot
npx skills experimental_install   # reads skills-lock.json
```

| Package | Skills | Cost |
|---------|--------|------|
| `heygen-com/hyperframes` | 19 (hyperframes, product-launch-video, faceless-explainer, …) | **$0** — local OSS render |
| `heygen-com/skills` | heygen-video, heygen-avatar, heygen-translate | Uses HeyGen **account credits** |

**$0 budget default:** HyperFrames + screen POV + ffmpeg. HeyGen MCP/skills only when user confirms spending a free-tier credit.

Location: `veil-xbot/.agents/skills/` · lockfile: `skills-lock.json`

### HeyGen CLI

- Docs: https://developers.heygen.com/cli
- `heygen video create` / `heygen video download` for CI

---

## HyperFrames (Apache 2.0 OSS)

- Repo: https://github.com/heygen-com/hyperframes
- HTML/CSS → deterministic MP4 · Node 22+ · FFmpeg
- Skill for agents: `npx skills add heygen-com/hyperframes`
- Wired: `src/integrations/hyperframes.ts`
  - `produce` teaser → scaffolds `data/exports/hyperframes-*/index.html`
  - CLI: `npm start hyperframes "Title | body" [--render]`
- No API key — local render only

---

## TinyFish OSS discovery

- `npm run oss-discover` → `data/research/oss-catalog.json`
- Searches GitHub for heygen, remotion, ugc, MCP video, Sui e2e, etc.
- Pinned: HyperFrames, HeyGen MCP, x-algorithm, Remotion, Mysten Sui

---

## LLM router (Venice / OpenAI / Flock)

- `src/ai/router.ts` — **locked system prompts per task** + self-learn injection
- Cascade: Venice → OpenAI → Flock (optional)
- Env: `VENICE_API_KEY`, `OPENAI_API_KEY`, optional `FLOCKAI_*`
- Check: `npm run smart`

---

## Sui sandbox wallet

- `npm run wallet veil` — generate Ed25519 keypair, Mysten testnet faucet
- `npm run sandbox veil` — wallet + Playwright viewports + screenshots
- Env: `SUI_NETWORK=testnet`, `SANDBOX_FAUCET_URL` (optional override)
- Veil dUSDC: manual Tally form `https://tally.so/r/Xx102L` (no public API)
- Wallet secrets: `data/sandbox/wallet-*.json` — **gitignored**

---

## FAL (already wired)

- `FAL_API_KEY` → Flux posters in `generate/poster.ts`
