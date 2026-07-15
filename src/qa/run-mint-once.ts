import { runSandboxMint, formatMintResult } from "./sandbox-mint.js";

const r = await runSandboxMint("veil");
console.log(formatMintResult(r));
process.exit(r.error ? 1 : 0);
