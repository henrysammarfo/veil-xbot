# Magmos Labs — product truth for Q&A

Synced from [henrysammarfo/magmoslabs](https://github.com/henrysammarfo/magmoslabs) + live app.

## What it is
Composable yield-dollar protocol on Sui (Sui Overflow 2026).

| Token / layer | Role |
|---------------|------|
| **AURUM** | Unit-stable dollar minted from USDC collateral (`aurum::forge`) |
| **sAURUM** | Index-based yield token from staking AURUM (`saurum::smelt`) |
| **MAGMA** | Governance + fee-sharing lane |
| **VYSS** | Permissioned yield stream for registered AURUM holders |
| **Liquidity Layer** | LP yield hook for AURUM-sided liquidity |
| **Thermal Limits + Forge Council** | Risk controls + scoped governance |

Lifecycle: **forge** (USDC→AURUM) → **smelt** (AURUM→sAURUM) → **refine** (sAURUM→AURUM) → **melt** (AURUM→USDC).

## Live URLs
- **App (use this in bio / ads):** https://magmoslabs.vercel.app
- **Repo:** https://github.com/henrysammarfo/magmoslabs
- Sibling repo `henrysammarfo/magmos` exists but product source of truth is **magmoslabs**

## What is live (testnet)
- Move contracts deployed on Sui testnet
- Frontend reads live (wallet-gated dashboard/profile)
- Write flows: `/aurum` forge/smelt/withdraw · `/saurum` refine/redeem

## Deployed package (testnet)
- Package: `0xe12b3253116bc30fc1f039edcf6bb6ff6f2e93b6a03852e4a021c86b8304194e`
- Treasury / Vault / ThermalConfig / PulseSchedule / AllocationRegistry / ForgeCouncil — see repo README

## Common questions

**What is AURUM?**
Unit-stable dollar minted from USDC collateral on Sui — forge lifecycle, not a static stablecoin pitch.

**Veil vs Magmos?**
Veil = stealth trading execution (DeepBook Predict). Magmos = yield-dollar / forge. Different products, same builder.

**APY?**
No guaranteed yield. Show mechanics + real txs — never returns promises.

**Forge?**
`aurum::forge()` mints AURUM from USDC. Demo on https://magmoslabs.vercel.app/aurum

## Never say
- Guaranteed stablecoin yield / APY
- "Better than USDC" without context
- Confusing Magmos with Veil PnL / stealth orders
