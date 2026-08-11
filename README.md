# Veil X Bot — Growth OS

**Marketing · GTM · Distribution · Q&A · Creative** for Veil, Magmos, and future projects.

See **[GROWTH-OS.md](./GROWTH-OS.md)** for the full playbook.

## Daily

```bash
npm run ops veil       # all teams → data/ops/TODAY.md
npm run serve          # dashboard
```

## Teams

| Team | Command |
|------|---------|
| Marketing | `npm run campaign veil` |
| GTM | `npm run launch veil` |
| Distribution | `npm run engage-batch 5 veil` |
| Creative UGC | `npm run ugc veil` |
| Clips | `npm run clip veil` → `npm run edit demo.mp4 veil` |
| Q&A | `npm run qa veil "why $5 stake?"` |

**Keys:** OpenAI + TinyFish only. **Media:** realistic screen POV + Pexels — no watermarked AI avatars.

## Setup

```bash
git clone https://github.com/henrysammarfo/kiln.git
cd kiln
cp .env.example .env
# Add keys (see API-KEYS.md) — Venice + OpenAI + TinyFish for Magmos ship path
npm install
npm run activate   # wire all OSS skills + goldmine + brain
npm run serve      # → http://127.0.0.1:3947
```

**Daily Magmos**

```bash
npm run ops magmos     # all teams → data/ops/TODAY.md
npm run ship magmos    # social-max → quality-gated pack
npm run serve
```

See **[OSS-STACK.md](./OSS-STACK.md)** — 268 installed skills under `.agents/skills`, fully path-resolved.

## Human taste (read first)

Edit **`taste.md`** — every generator injects it. Anti-slop gate.

## Commands

```bash
npm run categories          # booming niches (not Sui-only)
npm run trends all          # what's winning now
npm run discover 15 ai      # high-engagement URLs
npm run autolearn 5 veil    # watch → playbook → edit recipe
npm run engage-batch 5 veil # quote + reply under top trends
npm run poster veil quote-card "topic" --headline "6 words max"
npm run draft veil --topic "testnet loss receipt"
```

## Dashboard

`npm run serve` — Veil-styled UI: Drafts · Quote/Reply · Graphics · Learnings · Playbook · **Taste**

## API keys

See **[API-KEYS.md](./API-KEYS.md)** — minimum free stack:

| Key | Free? | Required? |
|-----|-------|-----------|
| `OPENAI_API_KEY` | Pay-as-you-go (~$5 credit for new accounts) | **Yes** |
| `TINYFISH_API_KEY` | Your existing key | **Yes** for auto-discover |
| X API | Free tier (draft-only mode) | **No** — you paste manually |
| Suno/HeyGen/Kling/etc. | Free web tiers | **No** — bot queues prompts |

## Learn loop

1. `npm run autolearn` — steals patterns from viral YT/TikTok/X
2. Read `data/playbook/MASTER.md`
3. Generate with taste.md loaded
4. Copy from dashboard → paste on X

## Related

- [Veil](https://github.com/henrysammarfo/veil) — stealth trading app
- [Magmos Labs](https://github.com/henrysammarfo/magmoslabs) — yield-dollar
