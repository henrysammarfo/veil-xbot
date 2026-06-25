# API keys — what you need now

**Free-first stack.** No paid X tier required for v1 (you paste posts manually).

---

## Required (2 keys)

| Key | Cost | Get it | Used for |
|-----|------|--------|----------|
| **`OPENAI_API_KEY`** | Pay-as-you-go; new accounts often get ~$5 free credit | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Drafts, quote/replies, video analysis, DALL-E posters, edit recipes |
| **`TINYFISH_API_KEY`** | You already have one | [tinyfish.ai](https://tinyfish.ai) | Auto-discover trending YT/TikTok/X URLs (no manual links) |

```env
OPENAI_API_KEY=sk-...
TINYFISH_API_KEY=...
```

**Rotate both after hackathon** if they were ever pasted in chat.

---

## Free — no key needed

| Tool | Used for |
|------|----------|
| **YouTube transcript** (`youtube-transcript` npm) | Pull captions from watch URLs — no Google API |
| **ffmpeg** (install locally) | Auto-edit screen recordings → 9:16 clips |
| **Dashboard** (`npm run serve`) | Copy/paste UI — localhost only |
| **taste.md** | Human quality gate — edit in repo |

---

## Optional — free web tiers (manual export)

Bot **queues prompts**; you download from the site if no API key:

| Service | Env (optional) | Free tier |
|---------|----------------|-----------|
| Suno | `SUNO_API_KEY` | [suno.com](https://suno.com) — music |
| HeyGen | `HEYGEN_API_KEY` | Avatar video |
| Kling | `KLING_API_KEY` | B-roll clips |
| VEED | `VEED_API_KEY` | Captions |
| Hyperframes | `HYPERFRAMES_API_KEY` | Speed ramps |

No keys? Commands still work — jobs saved under `data/media/` with manual instructions.

---

## Optional — not needed for v1

| Key | Notes |
|-----|-------|
| **X API** (`X_BEARER_TOKEN`, etc.) | Only if you want auto-post later (~$100/mo Basic). **Skip for now.** |
| **Hugging Face** | Fallback summarizer — OpenAI covers everything |
| **ElevenLabs** | Voice-over — optional |
| **GitHub token** | Changelog posts — optional |

---

## Brand links (free, no API)

```env
VEIL_DEMO_URL=https://veil-reviewer.vercel.app
VEIL_WAITLIST_URL=
MAGOS_REPO_URL=https://github.com/henrysammarfo/magmoslabs
VEIL_X_HANDLE=
MAGOS_X_HANDLE=
```

---

## Minimum to start today

1. `OPENAI_API_KEY` — copy + images + learning
2. `TINYFISH_API_KEY` — trend discovery
3. Edit `taste.md` with your voice
4. `npm install && npm run autolearn 3 && npm run serve`

That's it. Everything else is optional.
