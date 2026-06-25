/** Content phases — not every post is "I lost $5". Mix like real brands. */
export type ContentPhase =
  | "intro"       // Introducing Veil / Magmos
  | "teaser"      // Coming soon trailer beat
  | "trailer"     // Full 30–60s cinematic
  | "launch"      // Feature drop (gasless, etc.)
  | "proof"       // Testnet receipt / loss / win
  | "culture"     // Trend ride, no product
  | "education";  // How it works

export interface PhaseDef {
  id: ContentPhase;
  label: string;
  hookStyle: string;
  exampleHook: string;
  videoLength: string;
  ending: string;
}

export const CONTENT_PHASES: PhaseDef[] = [
  {
    id: "intro",
    label: "Product introduction",
    hookStyle: "Cinematic title card → problem in one line → logo",
    exampleHook: "Introducing Veil. Stealth execution on Sui.",
    videoLength: "30–45s",
    ending: "Fade to black + URL whisper",
  },
  {
    id: "teaser",
    label: "Teaser / coming soon",
    hookStyle: "Flash cuts, no full reveal, mystery",
    exampleHook: "Something's moving on DeepBook. Soon.",
    videoLength: "12–20s",
    ending: "Slow fade + 'Coming soon' + waitlist",
  },
  {
    id: "trailer",
    label: "Trailer (Krea-style ad)",
    hookStyle: "AI actor scene → twist → product glimpse (office/coffee UGC ad energy)",
    exampleHook: "POV: you just spilled coffee on your thesis. (cut) Unless your size was never visible.",
    videoLength: "45–60s",
    ending: "Music swell → logo → fade",
  },
  {
    id: "launch",
    label: "Feature launch",
    hookStyle: "News energy — gasless, new mode, etc.",
    exampleHook: "Gasless intents just shipped on testnet.",
    videoLength: "35–50s",
    ending: "CTA + demo link in reply",
  },
  {
    id: "proof",
    label: "Proof / receipt",
    hookStyle: "Loss/win on screen — receipt culture",
    exampleHook: "I lost $5.05 on testnet. On purpose.",
    videoLength: "40s",
    ending: "Tx hash freeze",
  },
  {
    id: "culture",
    label: "Culture / trend",
    hookStyle: "Ride viral format — product optional",
    exampleHook: "(matches trending audio/format)",
    videoLength: "15–30s",
    ending: "Soft brand tag or none",
  },
  {
    id: "education",
    label: "Education",
    hookStyle: "One concept explained with UI",
    exampleHook: "Why parent size leaks on public books.",
    videoLength: "45–60s",
    ending: "Try it link",
  },
];

export function getPhase(id: ContentPhase): PhaseDef {
  return CONTENT_PHASES.find((p) => p.id === id) ?? CONTENT_PHASES[0];
}

/** Week mix for new channel — intro before proof spam */
export function launchWeekPlan(brand: "veil" | "magmos"): ContentPhase[] {
  if (brand === "veil") {
    return ["intro", "teaser", "trailer", "launch", "proof", "education", "culture"];
  }
  return ["intro", "teaser", "trailer", "launch", "proof", "education", "culture"];
}
