# Studio — movie production model

Veil X Bot runs like a **film crew**, not a tweet generator.

## Crew roles

| Role | Bot module | Paid upgrade |
|------|------------|--------------|
| **Casting** | `produce` → cast brief | HeyGen / Kling avatar |
| **Director** | `produce` → 3-act trailer | — |
| **Editor** | `edit` + manifest SFX | Hyperframes / FAL |
| **Composer** | `music` | Suno / ElevenLabs |
| **Poster** | `poster` + design styles | FAL Flux |
| **QA** | `sandbox` | Playwright |
| **Distribution** | `engage-batch` | — |

## Content phases (not always "I lost $5")

```
intro → teaser → trailer → launch → proof → education → culture
```

```bash
npm run phases
npm run produce veil intro
npm run produce veil teaser
npm run produce veil trailer "gasless intents"
npm run produce veil launch "gasless feature"
```

## Krea-style ad (when you have budget)

Office worker, coffee spill, dialogue — **needs** `HEYGEN_API_KEY` or `KLING_API_KEY` or `FAL_API_KEY`.

Free tier: same script but **screen POV + text** until keys added.

## QA before demo

```bash
npm install playwright
npx playwright install chromium
# optional: SANDBOX_TEST_EMAIL / SANDBOX_TEST_PASSWORD in .env
npm run sandbox veil
```

Screenshots: phone · tablet · laptop · desktop → `data/sandbox/`

**Only when `readyForDemo: YES`** → run `produce` + `edit`.

## Quality tiers

```bash
npm run tier
```

- **Free (now):** ~70–75% — DALL-E posters, Pexels, screen record, ffmpeg
- **Paid (when you buy keys):** ~90%+ — FAL, HeyGen, Kling, no watermarks

## Poster styles (not generic dark UI)

```bash
npm run poster veil poster "Introducing Veil" --style editorial-serif
```

Styles: `editorial-serif` · `brutalist-type` · `glass-gradient` · `film-poster` · `swiss-grid` · `krea-ad`

## Learning = non-negotiable

```bash
npm run autolearn 8
npm run watch "https://tiktok.com/..."
```

Bot steals cut timing, motion, hooks from 200M-view refs → playbook → every `produce` call.

## Ending every trailer

All `produce` outputs include **fade ending** spec:
- `coming-soon` + waitlist
- `fade-black` + logo
- Music swell → 2.5s fade

See `API-ROADMAP.md` for FAL / MCP / Field purchase order.
