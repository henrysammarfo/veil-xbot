# Magmos Labs — product truth for Q&A

Synced from [henrysammarfo/magmoslabs](https://github.com/henrysammarfo/magmoslabs) + live app.

## Public voice (ads / X / trailers — USE THIS)
Say it like a friend:
- Magmos is a digital dollar on Sui that stays worth $1 and can earn while you hold it.
- No lockups. Reserves are on-chain. Join the waitlist.
- Never promise APY. Never invent hardware. Never use forge/smelt/thermal words in public creatives.

## What it is (internal / Q&A only)
Yield-dollar protocol on Sui (Sui Overflow 2026). Mechanics below are for support answers — not ad copy.

| Token / layer | Role |
|---------------|------|
| **AURUM** | Unit-stable dollar minted from USDC collateral (`aurum::forge`) |
| **sAURUM** | Index-based yield token from staking AURUM (`saurum::smelt`) |
| **MAGMA** | Governance + fee-sharing lane |
| **VYSS** | Permissioned yield stream for registered AURUM holders |
| **Liquidity Layer** | LP yield hook for AURUM-sided liquidity |
| **Thermal Limits + Forge Council** | Risk controls + scoped governance |

Lifecycle (docs only): **forge** (USDC→AURUM) → **smelt** (AURUM→sAURUM) → **refine** (sAURUM→AURUM) → **melt** (AURUM→USDC).

## Live URLs
- **App (use this in bio / ads):** https://magmoslabs.vercel.app
- **Repo:** https://github.com/henrysammarfo/magmoslabs

## What is live (testnet)
- Move contracts deployed on Sui testnet
- Frontend reads live (wallet-gated dashboard/profile)
- Write flows: `/aurum` · `/saurum`

## Common questions

**What is Magmos in one sentence?**
A digital dollar on Sui that stays $1 and can earn while you hold it.

**Veil vs Magmos?**
Veil = stealth trading. Magmos = digital dollar / earn-while-hold. Different products.

**APY?**
No guaranteed yield. Show mechanics + real txs — never returns promises.

## Never say (public)
- forge / smelt / thermal / Forge Council (ads/trailers/X)
- Guaranteed APY
- Confusing Magmos with Veil
- compostible / composable yield-dollar jargon in ads
