/**
 * web-to-app pack — Magmos (and Veil) demo as Android APK workshop brief.
 * Generates config JSON + step checklist for https://github.com/shiaho777/web-to-app
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { getProject } from "../projects/registry.js";
import { newId } from "../store.js";

export interface WebToAppPack {
  id: string;
  projectId: string;
  outputPath: string;
  configPath: string;
  markdown: string;
}

export function buildWebToAppPack(projectId: string): WebToAppPack {
  const project = getProject(projectId);
  const url =
    projectId === "magmos"
      ? env("MAGOS_DEMO_URL", "https://magmoslabs.vercel.app")
      : env("VEIL_DEMO_URL", "https://veil-reviewer.vercel.app");

  const config = {
    name: project.name,
    packageHint: projectId === "magmos" ? "labs.magmos.app" : "app.veil.trade",
    url,
    repo: project.secondaryUrl || project.primaryUrl,
    engine: "webview",
    features: {
      desktopMode: false,
      corsBypass: true,
      splash: true,
      orientation: "portrait",
    },
    iconNote: "Use veil-xbot/assets/brand/magmos-x-avatar.png for Magmos",
    sourceTool: "https://github.com/shiaho777/web-to-app",
  };

  const markdown = `# web-to-app — ${project.name} APK pack

**Tool:** [shiaho777/web-to-app](https://github.com/shiaho777/web-to-app) (Unlicense)
**Live URL to wrap:** ${url}

## Install builder (Android phone)

1. Build or install WebToApp from the repo (\`./gradlew assembleDebug\`)
2. Open WebToApp → **New** → **Website URL**
3. Paste: \`${url}\`
4. App name: **${project.name}**
5. Package: \`${config.packageHint}\`
6. Icon: upload Magmos/Veil mark (square PNG)
7. Enable: CORS bypass (SPA APIs), portrait lock
8. Export signed APK / AAB

## From PC (clone builder)

\`\`\`bash
git clone https://github.com/shiaho777/web-to-app.git
cd web-to-app
./gradlew assembleDebug
\`\`\`

Install APK on device, then create project with URL above.

## Magmos-specific

- Primary surface: \`/aurum\` forge flow — deep-link optional: ${url}/aurum
- Do **not** promise APY in store listing
- Listing copy: "Composable yield-dollar on Sui — forge → smelt → refine (testnet)"

## Config JSON

See companion \`web-to-app-config.json\` in this folder.

## Checklist

- [ ] WebToApp installed on device
- [ ] URL loads wallet connect
- [ ] Icon + name set
- [ ] APK exported + sideload tested
- [ ] Optional: Play AAB when ready
`;

  assertDataDir();
  const dir = join(DATA_DIR, "mobile");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const id = newId("apk");
  const outputPath = join(dir, `WEB-TO-APP-${projectId.toUpperCase()}.md`);
  const configPath = join(dir, `web-to-app-${projectId}.json`);
  writeFileSync(outputPath, markdown);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  writeFileSync(join(dir, "latest.md"), markdown);

  return { id, projectId, outputPath, configPath, markdown };
}
