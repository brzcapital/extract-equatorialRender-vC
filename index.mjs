/* eslint-disable no-console */
import express from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import cors from "cors";
import winston from "winston";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 10000;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

const BASE_UPLOADS_DIR = path.join(process.cwd(), "uploads");
const JSON_DIR = path.join(BASE_UPLOADS_DIR, "json");
const USAGE_FILE = path.join(BASE_UPLOADS_DIR, "usage.json");
fs.mkdirSync(JSON_DIR, { recursive: true });

async function initUsage() {
  try {
    await fsp.access(USAGE_FILE);
  } catch {
    const now = new Date();
    const payload = {
      month: now.toISOString().slice(0, 7),
      total_tokens: 0,
      daily: {},
      processed_count: 0,
      recent: []
    };
    await fsp.writeFile(USAGE_FILE, JSON.stringify(payload, null, 2));
  }
}
await initUsage();

function updateUsage(tokensUsed, hash, status) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  let usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
  if (usage.month !== month) {
    usage = { month, total_tokens: 0, daily: {}, processed_count: 0, recent: [] };
  }
  usage.total_tokens += tokensUsed;
  usage.daily[day] = (usage.daily[day] || 0) + tokensUsed;
  usage.processed_count += 1;
  usage.recent.unshift({ ts: now.toISOString(), hash, status, tokensUsed });
  usage.recent = usage.recent.slice(0, 5);
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  return usage;
}

const upload = multer({ storage: multer.memoryStorage() });

function hashBufferSHA256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function saveJsonByDate(data, hash) {
  const dateDir = path.join(JSON_DIR, new Date().toISOString().slice(0, 10));
  fs.mkdirSync(dateDir, { recursive: true });
  const filePath = path.join(dateDir, `${hash}.json`);
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

app.get("/health", async (req, res) => {
  try {
    const usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    res.json({ status: "online", usage });
  } catch {
    res.json({ status: "online", erro: "usage.json não encontrado" });
  }
});

app.post("/extract-hybrid", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente." });
    const buffer = req.file.buffer;
    const hash = hashBufferSHA256(buffer);
    const output = { exemplo: true, hash_pdf: hash, data: new Date().toISOString() };
    await saveJsonByDate(output, hash);
    updateUsage(0, hash, "ok");
    res.json(output);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => logger.info(`🚀 Servidor rodando na porta ${PORT}`));
