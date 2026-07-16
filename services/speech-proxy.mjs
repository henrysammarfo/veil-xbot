/**
 * Speech stack proxy — Voicebox TTS + VibeVoice ASR compatible HTTP APIs.
 * Backed by Venice TTS + OpenAI Whisper so `services:up` works without local GPU.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.SPEECH_PROXY_PORT || 8780);
const VENICE_KEY = process.env.VENICE_API_KEY || process.env.VERNICE_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const VENICE_URL = (process.env.VENICE_API_URL || "https://api.venice.ai/api/v1").replace(/\/$/, "");

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function veniceTts(text) {
  if (!VENICE_KEY) throw new Error("VENICE_API_KEY required for TTS proxy");
  const res = await fetch(`${VENICE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VENICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.VENICE_TTS_MODEL || "tts-kokoro",
      input: text,
      voice: process.env.VENICE_TTS_VOICE || "am_michael",
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`Venice TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function whisperAsr(wavBuf, filename) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY required for ASR proxy");
  const form = new FormData();
  form.append("file", new Blob([wavBuf], { type: "audio/wav" }), filename || "audio.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = await res.json();
  return {
    text: (raw.text || "").trim(),
    language: raw.language || "en",
    words: (raw.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
    segments: (raw.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text })),
  };
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let start = buf.indexOf(sep) + sep.length;
  while (start < buf.length) {
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    if (buf[start] === 0x0d) start += 2;
    const headerEnd = buf.indexOf("\r\n\r\n", start);
    if (headerEnd < 0) break;
    const header = buf.subarray(start, headerEnd).toString("utf8");
    const nameM = /name="([^"]+)"/.exec(header);
    const fileM = /filename="([^"]+)"/.exec(header);
    const next = buf.indexOf(sep, headerEnd + 4);
    const end = next < 0 ? buf.length : next - 2;
    const data = buf.subarray(headerEnd + 4, end);
    if (nameM) parts.push({ name: nameM[1], filename: fileM?.[1], data });
    start = next < 0 ? buf.length : next + sep.length;
  }
  return parts;
}

const server = createServer(async (req, res) => {
  const url = req.url || "/";
  try {
    if (req.method === "GET" && (url === "/" || url === "/health" || url === "/v1/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "veil-speech-proxy",
          venice: Boolean(VENICE_KEY),
          openai: Boolean(OPENAI_KEY),
          endpoints: ["/v1/tts", "/api/tts", "/tts", "/transcribe", "/v1/asr"],
        }),
      );
      return;
    }

    if (req.method === "POST" && (url === "/v1/tts" || url === "/api/tts" || url === "/tts")) {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      if (!body.text?.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "text required" }));
        return;
      }
      const audio = await veniceTts(body.text.trim());
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
      res.end(audio);
      return;
    }

    if (req.method === "POST" && (url === "/transcribe" || url === "/v1/asr" || url === "/asr")) {
      const ct = req.headers["content-type"] || "";
      let fileBuf = null;
      let filename = "audio.wav";
      if (ct.includes("multipart/form-data")) {
        const m = /boundary=(.+)$/i.exec(ct);
        if (!m) throw new Error("multipart boundary missing");
        const parts = parseMultipart(await readBody(req), m[1].trim());
        const file = parts.find((p) => p.name === "file" || p.filename);
        if (!file) throw new Error("file part required");
        fileBuf = file.data;
        filename = file.filename || filename;
      } else {
        fileBuf = await readBody(req);
      }
      const result = await whisperAsr(fileBuf, filename);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found", url }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

server.listen(PORT, () => {
  console.log(`veil-speech-proxy on :${PORT}`);
  console.log(`  VOICEBOX_URL=http://127.0.0.1:${PORT}`);
  console.log(`  VIBEVOICE_ASR_URL=http://127.0.0.1:${PORT}/transcribe`);
  console.log(`  Venice TTS: ${VENICE_KEY ? "yes" : "NO KEY"} · Whisper: ${OPENAI_KEY ? "yes" : "NO KEY"}`);
});
