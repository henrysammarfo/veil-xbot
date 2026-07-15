import { veniceTextToSpeech } from "../src/integrations/venice.ts";
const r = await veniceTextToSpeech("Stealth execution on Sui testnet.", {
  outName: "test-vo.mp3",
  force: true,
  projectId: "veil",
});
console.log("OK", r);
