# Magmos / veil-xbot — OSS stack (full wires)

## Replace backends, never drop flows

| Flow | Pattern kept | Default backend | Optional |
|------|--------------|-----------------|----------|
| Ad maker | domain → concepts → stills | TinyFish research + Venice images | Context.dev key |
| Walkthrough agent PiP | screen + presenter PiP | Venice still+TTS → avatar.mp4 | HeyGen if subscribed |
| Edit / ads | footage → master → multi-aspect | freecut-style `edit-auto` | Venice b-roll/TTS |

## Skills the bot uses (Goose + HyperFrames)

```bash
npx gooseworks install --all    # Cursor agent copies into .agents/skills
npm run skills adopt            # Index 200+ into bot runtime + brain
npm run skills search ugc
npm run skills show ad-angle-miner
```

Every LLM task (`ad-maker`, `walkthrough`, `draft`, `launch`, …) auto-injects matching skill shortlists from the catalog. `ops` / `grow` / `brain seed` re-adopt skills into the growth brain.

## Product-walkthrough (Russo / HyperFrames)

```
inspect → script/storyboard/timing → Playwright capture → Venice presenter PiP
→ HyperFrames compose → validate → render 1080p MP4
```

```bash
npm run walkthrough magmos
# PRESENTER_VIDEO=1  → short Venice T2V talking head instead of still+TTS
```

## Cheap ad floors (million-view hunting)

| Platform | Practical learn | Cheapest path |
|----------|-----------------|---------------|
| X | $20–50/day ($5 technical) | Video views ~$0.01–0.03 |
| Meta/IG | Awareness $10–25/day | Video views / Reach |
| Google | YT/Display $5–20/day | YouTube CPV / Display ~$0.63 CPC |

Weekly $500 Magmos split default: X 40% · Meta 35% · Google YT 25%.

## Stack commands

| Repo | Command |
|------|---------|
| [hyperframes](https://github.com/heygen-com/hyperframes) | `walkthrough` |
| [ad-maker](https://github.com/context-dot-dev/ad-maker) pattern | `ad-maker` (Venice) |
| [goose-skills](https://github.com/gooseworks-ai/goose-skills) | `skills adopt` |
| freecut | `edit-auto` |
| openshorts | `shorts` |

```bash
npm run oss-stack
```
