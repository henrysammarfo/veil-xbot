/**
 * Veil 3-minute judge demo — smart capture steps + narration beats.
 * Explorer proof lives in README — never in recording.
 */
export interface VeilDemoBeat {
  startSec: number;
  endSec: number;
  narration: string;
  onScreen: string;
  visual: string;
}

export function veil3MinBeats(mintDigest?: string): VeilDemoBeat[] {
  const txHint = mintDigest
    ? `On-chain mint on testnet — tx ${mintDigest.slice(0, 12)} in the README.`
    : "Live testnet fills — tx proof in the README.";
  return [
    {
      startSec: 0,
      endSec: 14,
      narration:
        "Everyone sees your size when you hit the order book. Veil fixes that — stealth execution on Sui. Your intent stays off-chain while real fills land on DeepBook Predict.",
      onScreen: "STEALTH EXECUTION ON SUI",
      visual: "Landing hero — hook",
    },
    {
      startSec: 14,
      endSec: 28,
      narration:
        "Large orders leak alpha. One clip on the public book and the market front-runs you. Scroll the problem — then we move to the real app.",
      onScreen: "LARGE ORDERS LEAK ALPHA",
      visual: "Landing scroll — problem",
    },
    {
      startSec: 28,
      endSec: 62,
      narration:
        "Already in the app — execution modes. Fifteen-minute BTC long, shortest Predict horizon. Bull mode, plain English, Submit — watch the enclave seal a live order on testnet.",
      onScreen: "15M BULL · LIVE ORDER",
      visual: "Modes + 15m bull intent submit",
    },
    {
      startSec: 62,
      endSec: 88,
      narration:
        "Bear mode next — same flow, different engine. PLP vault plus hedge. Then Earn and Parlay on the modes grid. Four moods, one stealth stack.",
      onScreen: "BEAR · EARN · PARLAY MOODS",
      visual: "Bear order + mode tour",
    },
    {
      startSec: 88,
      endSec: 112,
      narration:
        "Kelly sizing shows what you actually risk — not a fake headline with five dollars staked. Intent size and cost basis stay honest on the portfolio panel.",
      onScreen: "KELLY STAKE · REAL COST BASIS",
      visual: "Portfolio capital panel",
    },
    {
      startSec: 112,
      endSec: 136,
      narration:
        `Live orders — there is the fifteen-minute leg we just placed. ${txHint} Real dUSDC. Real Predict fills. Every row is the actual app.`,
      onScreen: "LIVE ORDERS · YOUR ORDER",
      visual: "Orders dashboard — verify order row",
    },
    {
      startSec: 136,
      endSec: 158,
      narration:
        "TEE-attested fills — provable execution, not trust-me screenshots. Settlement syncs with the oracle horizon. Realized PnL when the market closes.",
      onScreen: "TEE PROOF · SETTLEMENT",
      visual: "Proof console",
    },
    {
      startSec: 158,
      endSec: 180,
      narration:
        "Try Veil on testnet. Link below. Stealth execution is live — go lose five dollars on purpose and prove it yourself.",
      onScreen: "TRY VEIL · LINK BELOW",
      visual: "CTA landing",
    },
  ];
}

export function veil3MinNarration(mintDigest?: string): string {
  return veil3MinBeats(mintDigest)
    .map((b) => b.narration)
    .join(" ");
}

export const VEIL_3MIN_TARGET_SEC = 180;

export interface VeilCaptureOpts {
  demoUrl: string;
  device?: "desktop" | "mobile";
}

/** Smart steps — tight landing, live 15m orders, mood tour, verify on orders page. */
export function veil3MinCaptureSteps(opts: VeilCaptureOpts) {
  const base = opts.demoUrl.replace(/\/$/, "");
  const mobile = opts.device === "mobile";
  const dash = `${base}/dashboard`;

  const navOrders = mobile
    ? 'nav[aria-label="Primary"] >> text=Orders'
    : '[aria-label="Orders"]';
  const navPortfolio = mobile
    ? 'nav[aria-label="Primary"] >> text=Portfolio'
    : '[aria-label="Portfolio"]';

  const intent15mBull = "15m BTC long — quick scalp to the upside, bull mode";
  const intent15mBear = "15m BTC bear hedge — might drop in the next fifteen minutes, bear mode";

  return [
    { action: "goto" as const, url: base, note: "Veil landing — stealth hook" },
    { action: "scene" as const, note: "landing hook" },
    { action: "wait" as const, ms: 1800 },
    { action: "scroll" as const, scrollFrac: 0.55, note: "Hero scroll" },
    { action: "wait" as const, ms: 1200 },
    { action: "scene" as const, note: "alpha leak problem" },
    { action: "scroll" as const, scrollFrac: 0.5 },
    { action: "wait" as const, ms: 1200 },
    { action: "scroll" as const, scrollFrac: 0.4 },
    { action: "wait" as const, ms: 800 },

    { action: "wait" as const, ms: 800 },
    { action: "waitForReady" as const, note: "landing wallet warm", ms: 4000 },

    {
      action: "ensureVeilAuth" as const,
      url: `${dash}/modes`,
      note: "Auto-connect — straight to modes",
    },
    { action: "dismissOnboarding" as const, note: "Skip welcome tour" },
    {
      action: "assertManagerBalance" as const,
      note: "Manager funded for bull+bear",
      minUsdc: 50,
    },
    { action: "scene" as const, note: "wallet connected modes" },
    { action: "observe" as const, note: "Execution modes visible" },

    { action: "waitForReady" as const, note: "modes ready", selector: "textarea" },
    {
      action: "fill" as const,
      selector: "textarea",
      text: intent15mBull,
      note: "15m bull intent",
    },
    {
      action: "waitForSelector" as const,
      selector: "p.text-emerald-400:has-text('15')",
      ms: 30000,
      note: "Parsed 15m bull intent",
    },
    { action: "observe" as const, note: "Parsed 15m bull intent on screen" },
    { action: "wait" as const, ms: 1500 },
    {
      action: "click" as const,
      selector: "button:has-text('Submit intent')",
      note: "Submit 15m bull order",
    },
    { action: "waitForOrderDone" as const, ms: 200000, note: "Bull order sealed" },
    { action: "assertNoErrors" as const, note: "After bull order" },
    { action: "scene" as const, note: "15m bull order placed" },
    { action: "observe" as const, note: "Bull order confirmed toast" },

    {
      action: "fill" as const,
      selector: "textarea",
      text: intent15mBear,
      note: "15m bear intent",
    },
    { action: "waitForSelector" as const,
      selector: "p.text-emerald-400:has-text('15')",
      ms: 30000,
      note: "Parsed 15m bear intent",
    },
    { action: "assertManagerBalance" as const, note: "Balance before bear order", minUsdc: 25 },
    { action: "observe" as const, note: "Parsed 15m bear intent on screen" },
    { action: "wait" as const, ms: 1500 },
    {
      action: "click" as const,
      selector: "button:has-text('Submit intent')",
      note: "Submit 15m bear order",
    },
    { action: "waitForOrderDone" as const, ms: 200000, note: "Bear order sealed" },
    { action: "assertNoErrors" as const, note: "After bear order" },
    { action: "scene" as const, note: "bear mood order placed" },

    { action: "scroll" as const, scrollFrac: 0.6, note: "Modes grid tour" },
    { action: "wait" as const, ms: 2000 },
    { action: "hover" as const, selector: "h2:has-text('Earn')", note: "Earn mode card" },
    { action: "wait" as const, ms: 1500 },
    { action: "hover" as const, selector: "h2:has-text('Parlay')", note: "Parlay mode card" },
    { action: "wait" as const, ms: 1500 },
    { action: "scene" as const, note: "earn parlay modes tour" },

    mobile
      ? { action: "click" as const, selector: navPortfolio, note: "Portfolio tab" }
      : { action: "goto" as const, url: `${dash}/portfolio`, note: "Portfolio + Kelly" },
    { action: "waitForReady" as const, note: "portfolio capital panel", ms: 30000 },
    { action: "scroll" as const, scrollFrac: 0.45, note: "Capital panel" },
    { action: "wait" as const, ms: 4000 },
    { action: "scene" as const, note: "Kelly stake cost basis" },

    { action: "assertManagerBalance" as const, note: "Balance OK before orders page" },
    mobile
      ? { action: "click" as const, selector: navOrders, note: "Orders tab" }
      : { action: "goto" as const, url: `${dash}/orders`, note: "Live orders" },
    { action: "waitForReady" as const, note: "orders loaded", ms: 30000 },
    { action: "click" as const, selector: "button:has-text('Live')", note: "Filter live orders" },
    {
      action: "waitForSelector" as const,
      selector: "a[href*='/dashboard/orders/']",
      ms: 30000,
      note: "Order row visible",
    },
    { action: "wait" as const, ms: 4000 },
    { action: "scroll" as const, scrollFrac: 0.4 },
    { action: "scene" as const, note: "live testnet orders" },

    { action: "goto" as const, url: `${dash}/proofs`, note: "TEE proof console" },
    { action: "waitForReady" as const, note: "proof console ready", ms: 30000 },
    { action: "scroll" as const, scrollFrac: 0.45 },
    { action: "wait" as const, ms: 4000 },
    { action: "scene" as const, note: "TEE proof settlement" },

    { action: "goto" as const, url: base, note: "CTA landing" },
    { action: "waitForReady" as const, note: "CTA landing ready" },
    { action: "scene" as const, note: "CTA try Veil" },
    { action: "wait" as const, ms: 2500 },
  ];
}
