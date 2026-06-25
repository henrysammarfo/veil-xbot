# First post → 1k views (no blue tick)

**Serious playbook.** No guarantee — but this is how small accounts break 1k when the content hits.

---

## The math

Without blue tick you need **one of**:
1. **Controversy / loss / receipt** — people quote to argue or verify
2. **Riding a wave** — quote-tweet a 50k+ post with a sharp 1-liner + video
3. **Reply chain** — 20+ quality replies in 30 min pushes distribution

You need **video** for first post. Text-only rarely clears 1k cold.

---

## Veil first post (recommended)

**Hook (on screen + text):** `I lost $5.05 on testnet. On purpose.`

**Why it works:** Loss porn + proof. Skeptics click. Believers quote. No blue tick needed.

**Edit style:** `loss-receipt` or `anime-hype` if you want energy

```bash
npm run first-post veil
npm run edit your-screen-recording.mp4 veil loss-receipt
```

**Post structure:**
1. Video 42s — hook 0–1.5s, dashboard loss 2–20s, tx proof 20–35s, freeze CTA 35–42s
2. Caption: one dry line + link in **reply** not main post
3. Within 60s: reply with demo URL `?src=x_first`
4. Same day: 3 quote-tweets from `engage-batch`

---

## Magmos first post

**Hook:** `Forge tx landed. Not a mockup.`

**Edit style:** `raw-build` or `cinematic-broll`

Same checklist — proof first, APY never.

---

## Edit stack (anime / b-roll / SFX)

| Layer | Bot does | You do once |
|-------|----------|-------------|
| **Cuts + zoom** | ffmpeg from manifest | Record screen |
| **SFX on beat** | Mixes if `assets/sfx/*.mp3` exist | Download 5 free MP3s (see assets/sfx/README) |
| **Music** | Suno prompt queued | Download from suno.com |
| **B-roll** | Kling/Hyperframes prompts queued | Download clips, overlay in CapCut if needed |
| **Anime overlays** | hyperframes prompt in manifest | Optional 0.4s speed-line clip |

```bash
npm run edit-plan veil anime-hype     # timeline only
npm run edit demo.mp4 veil anime-hype # render + SFX
```

---

## Day-of timeline (UTC)

| Time | Action |
|------|--------|
| T-24h | `npm run autolearn 8` + `npm run engage-batch 5` |
| T-2h | `npm run first-post veil` — review taste.md |
| T-0 | Post video |
| T+1m | Reply with link |
| T+5m | Quote-tweet #1 trending draft |
| T+30m | 15 replies on big accounts (pre-written engages) |
| T+2h | Quote-tweet #2 and #3 |

---

## What kills 1k

- Feature list opener
- "Excited to announce"
- Tagging big accounts begging for RT
- No video
- Posting once and logging off

---

## Commands

```bash
npm run first-post veil
npm run first-post magmos
npm run edit-plan veil anime-hype
npm run edit recording.mp4 veil anime-hype
```

Pack saved: `data/launch/latest-first-post.md`
