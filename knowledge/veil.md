# Veil — product truth for Q&A (no marketing fluff)

## What it is
Stealth trading on Sui testnet. Parent order intent stays off-chain; execution slices on DeepBook Predict. TEE-attested fills.

## Live URLs
- Demo: https://veil-reviewer.vercel.app
- Waitlist: env VEIL_WAITLIST_URL when live

## Common questions

**Why did my order show $25 but stake ~$5?**
$25 is intent size. Actual deploy uses Kelly + TWAP — real stake is costBasisUsd (~$5.05).

**Why SETTLED but still shows open on-chain?**
Veil order SETTLED = enclave slices done. On-chain Predict legs may still show until oracle/settlement sync.

**What is stealth execution?**
Your full parent size is not visible as one clip on the public book — sliced on DeepBook.

**Is this mainnet?**
Testnet / demo environment. Real txs on testnet, not financial advice.

**15m orders?**
Supported. Settlement depends on market horizon oracle — check order detail for realized PnL.

**TEE?**
Trusted execution environment attestation for fill proofs — see proof console in app.

## Never say
- Guaranteed returns
- Risk-free
- "Bank-grade" without proof
