# Human taste — quality gate

**Read this before every draft, poster, quote, or reply.**  
If output breaks these rules → discard and regenerate. Learn from playbooks and tutorials first; don't freestyle slop.

---

## Who we are

- Founders who **shipped on testnet** — real txs, real losses, real proofs.
- Dry, specific, slightly blunt. Not a marketing agency.
- Veil = stealth execution. Magmos = yield-dollar. Tie-in only when it fits the trend.

---

## Instant reject (slop list)

**Copy**
- "Excited to announce" / "Thrilled to share" / "Big news"
- "Game-changer" / "revolutionary" / "disrupting" / "unlock" / "leverage" (verb)
- "In today's fast-paced world" / "Here's why this matters"
- Fake questions as hooks ("Are you ready for…?" "What if I told you…?")
- Hashtag soup (#DeFi #Crypto #Web3 #Innovation #Blockchain)
- More than **one** emoji per post (zero is fine)
- "Not financial advice" without any actual context
- Threads that are 10 tweets of nothing to hide no demo

**Visuals**
- Glossy 3D gold coins, neon cityscapes, hooded hackers
- "AI slop" faces, stock-photo handshakes, lens flare on everything
- Unreadable tiny text on busy backgrounds
- Fake exchange logos or made-up tickers

**Engagement**
- Reply-bait under unrelated viral posts ("Great thread! We also…")
- Quote-tweets that add zero take — just a product link
- Copying the trend's words without a **sharp angle**

---

## Required (every post)

1. **One concrete detail** — number, %, tx hash fragment, screen, time ("15m", "-$5.05", "testnet").
2. **One line a skeptic believes** — no hype, just observable fact.
3. **Steal before invent** — pull hook/cut/CTA from `data/playbook/MASTER.md` or recent learnings.
4. **Short** — prefer under 240 chars for main post; thread only when each line earns its place.

---

## Voice

| Do | Don't |
|----|-------|
| "Order settled. -100%. Receipt on-chain." | "Amazing journey to redefine DeFi!" |
| "Your parent size is visible on DeepBook." | "Introducing the future of trading!" |
| "We lost $5 on testnet. Here's the tx." | "Incredible milestone for the community!" |
| Dry humor, one beat | Motivational speaker energy |

---

## Quote & reply under trends

- **Ride the trend first** — add a take people would RT without your product.
- Product mention = **last line** or omitted if forced.
- Reply like a human in the replies: 1 sentence, no pitch deck.
- If you can't add value in 200 chars, skip that trend.

---

## Graphics / posters

- Dark `#0a0a0a` field, off-white type, **one** accent (subtle, not amber explosion).
- One headline, max 6 words. No paragraph on image.
- UI screenshot > abstract crypto art.
- Match Veil dashboard aesthetic: minimal, monospace labels, thin borders.

---

## Learning loop (non-negotiable)

Before generating copy:

1. Run `npm run autolearn` or `npm run watch <url>` on **high-engagement** refs.
2. Read playbook patterns — use their hook structure, not your default LLM voice.
3. Check category trends (`npm run trends all`) — what's winning **this week**, not Sui-only.

---

## UGC / avatar / clips (realistic only)

**UGC**
- Founder at desk, phone showing **real app**, screen POV
- Imperfect lighting OK — perfection reads as AI
- NO "AI UGC girl/guy" — instant credibility death

**Avatar**
- Default: **no face** — hook text on screen over dashboard recording
- Optional: real founder 5s clip (you record once)
- NEVER: watermarked HeyGen/Kling synthetic spokesperson

**Clips / b-roll**
- Real UI recording is hero — Pexels only for 1–2s cutaways
- Nothing "displaced": no NYC skyline for a Sui dashboard product
- SFX on beat — see `npm run music <style>`

**Q&A**
- Answer from `knowledge/<project>.md` truth — no invented features
- Short replies, link in reply not spam main post

---

## Edit this file

When something posts well or flops, add a line under **Notes**:

### Notes
- (add wins/fails here)
