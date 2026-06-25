import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, XBOT_PORT, XBOT_ROOT } from "./config.js";
import {
  listDrafts,
  listLearnings,
  listGraphics,
  listEngage,
  readPlaybook,
  updateDraftStatus,
  updateEngageStatus,
} from "./store.js";
import { formatDraftForCopy } from "./generate/draft.js";
import { formatEngageForCopy } from "./generate/engage.js";
import { readTaste } from "./taste.js";

const app = new Hono();

const NAV = [
  { href: "/", label: "Drafts", key: "drafts" },
  { href: "/engage", label: "Quote / Reply", key: "engage" },
  { href: "/graphics", label: "Graphics", key: "graphics" },
  { href: "/learn", label: "Learnings", key: "learn" },
  { href: "/playbook", label: "Playbook", key: "playbook" },
  { href: "/taste", label: "Taste", key: "taste" },
] as const;

app.use("/static/*", serveStatic({ root: join(XBOT_ROOT, "public"), rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

function shell(active: (typeof NAV)[number]["key"], title: string, eyebrow: string, body: string): string {
  const nav = NAV.map(
    (n) => `<a href="${n.href}" class="${n.key === active ? "active" : ""}">${n.label}</a>`,
  ).join("");
  const stats = `
    <div class="stats">
      <div class="stat"><div class="stat-n">${listDrafts().length}</div><div class="stat-l">Drafts</div></div>
      <div class="stat"><div class="stat-n">${listEngage().length}</div><div class="stat-l">Engage</div></div>
      <div class="stat"><div class="stat-n">${listGraphics().length}</div><div class="stat-l">Graphics</div></div>
      <div class="stat"><div class="stat-n">${listLearnings().length}</div><div class="stat-l">Learnings</div></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)} · Veil X Bot</title>
  <link rel="stylesheet" href="/static/veil-dashboard.css"/>
</head>
<body>
  <div class="shell">
    <header class="header">
      <div class="brand">
        <span class="brand-mark">Veil</span>
        <span class="brand-sub">X Bot</span>
      </div>
      <nav class="nav-pill">${nav}</nav>
    </header>
    <div class="taste-banner">Quality gate: <a href="/taste">taste.md</a> — learn playbooks before posting. Manual paste only.</div>
    ${stats}
    <div class="page-eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </div>
</body>
</html>`;
}

app.get("/", (c) => {
  const drafts = listDrafts();
  const cards = drafts
    .map(
      (d) => `<article class="card">
        <div class="card-meta">${d.brand} · ${d.status} · ${new Date(d.createdAt).toLocaleString()}</div>
        <strong>${escapeHtml(d.hook)}</strong>
        <pre class="copy-block" id="d-${d.id}">${escapeHtml(formatDraftForCopy(d))}</pre>
        <div class="actions">
          <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('d-${d.id}').innerText)">Copy for X</button>
          ${d.status === "draft" ? `<form method="post" action="/draft/${d.id}/posted"><button class="btn btn-ghost" type="submit">Mark posted</button></form>` : ""}
        </div>
      </article>`,
    )
    .join("");
  const body = `<p class="lead">Copy → paste on X. No auto-post.</p>${cards || '<p class="lead">No drafts. Run: <code>npm run draft veil</code></p>'}`;
  return c.html(shell("drafts", "Post drafts", "Manual publish", body));
});

app.get("/engage", (c) => {
  const items = listEngage();
  const cards = items
    .map(
      (d) => `<article class="card">
        <div class="card-meta">${d.type} · ${d.brand} · ${d.status} · ${d.category || "general"}</div>
        <strong>Under: ${escapeHtml(d.contextTitle)}</strong>
        ${d.contextUrl ? `<div class="card-meta">${escapeHtml(d.contextUrl)}</div>` : ""}
        <pre class="copy-block" id="e-${d.id}">${escapeHtml(formatEngageForCopy(d))}</pre>
        <div class="actions">
          <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('e-${d.id}').innerText)">Copy</button>
          ${d.status === "draft" ? `<form method="post" action="/engage/${d.id}/posted"><button class="btn btn-ghost" type="submit">Mark posted</button></form>` : ""}
        </div>
      </article>`,
    )
    .join("");
  const body = `<p class="lead">Quote-tweets and replies under what's winning.</p>${cards || '<p class="lead">Run: <code>npm run engage-batch 5 veil</code></p>'}`;
  return c.html(shell("engage", "Quote & reply", "Engagement", body));
});

app.get("/graphics", (c) => {
  const items = listGraphics();
  const cards = items
    .map((g) => {
      const img = existsSync(g.localPath) ? `<img src="/graphics/file/${g.id}" alt=""/>` : "";
      return `<article class="card">
        <div class="card-meta">${g.kind} · ${g.brand} · ${g.usage}</div>
        <strong>${escapeHtml(g.topic)}</strong>
        ${g.headline ? `<p class="lead">${escapeHtml(g.headline)}</p>` : ""}
        ${img}
      </article>`;
    })
    .join("");
  const body = `<p class="lead">Posters and quote cards — Veil dark aesthetic.</p>${cards || '<p class="lead">Run: <code>npm run poster veil quote-card "topic"</code></p>'}`;
  return c.html(shell("graphics", "Graphics", "Design", body));
});

app.get("/graphics/file/:id", (c) => {
  const g = listGraphics().find((x) => x.id === c.req.param("id"));
  if (!g || !existsSync(g.localPath)) return c.text("Not found", 404);
  return c.body(readFileSync(g.localPath), 200, { "Content-Type": "image/png" });
});

app.get("/learn", (c) => {
  const items = listLearnings();
  const cards = items
    .map(
      (v) => `<article class="card">
        <strong>${escapeHtml(v.title)}</strong>
        <div class="card-meta">${v.platform} · ${escapeHtml(v.url)}</div>
        <p>${escapeHtml(v.analysis.summary)}</p>
        <p><span class="card-meta">Hook</span> ${escapeHtml(v.analysis.hookPattern)}</p>
        <p><span class="card-meta">Steal</span> ${v.analysis.stealablePatterns.map(escapeHtml).join(" · ")}</p>
      </article>`,
    )
    .join("");
  const body = `<p class="lead">Patterns stolen from high-engagement refs.</p>${cards || '<p class="lead">Run: <code>npm run autolearn 5</code></p>'}`;
  return c.html(shell("learn", "Learnings", "Watch & learn", body));
});

app.get("/playbook", (c) => {
  const md = readPlaybook() || "Run: npm run playbook";
  const body = `<div class="playbook"><pre>${escapeHtml(md)}</pre></div>`;
  return c.html(shell("playbook", "Master playbook", "Aggregated patterns", body));
});

app.get("/taste", (c) => {
  const md = readTaste() || "(taste.md missing)";
  const body = `<p class="lead">Edit this file locally — every generator reads it.</p><div class="playbook"><pre>${escapeHtml(md)}</pre></div>`;
  return c.html(shell("taste", "Human taste", "Anti-slop gate", body));
});

app.post("/draft/:id/posted", async (c) => {
  updateDraftStatus(c.req.param("id"), "posted");
  return c.redirect("/");
});

app.post("/engage/:id/posted", async (c) => {
  updateEngageStatus(c.req.param("id"), "posted");
  return c.redirect("/engage");
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function startServer(port = Number(env("XBOT_PORT") || XBOT_PORT)): void {
  const p = port || 3947;
  serve({ fetch: app.fetch, port: p }, () => {
    console.log(`Veil X Bot → http://127.0.0.1:${p}`);
  });
}
