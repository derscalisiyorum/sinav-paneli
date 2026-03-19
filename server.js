const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "db.json");

function normalizeDB(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  if (!Array.isArray(db.participants)) db.participants = [];
  if (!Array.isArray(db.archivedParticipants)) db.archivedParticipants = [];
  if (!db.meta || typeof db.meta !== "object") db.meta = {};
  return db;
}
function ensureDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(normalizeDB({ participants: [] }), null, 2), "utf8");
  }
}
function readDB() {
  ensureDB();
  try {
    return normalizeDB(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } catch (e) {
    return normalizeDB({ participants: [] });
  }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(normalizeDB(data), null, 2), "utf8");
}
function nowIso() {
  return new Date().toLocaleString("tr-TR");
}
function computeStats(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const finished = all.filter((x) => !!x.finishedAt);
  const active = all.filter((x) => !x.finishedAt);
  const scores = finished.map((x) => Number(x.score || 0)).filter((n) => Number.isFinite(n));
  const averageScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    total: all.length,
    active: active.length,
    finished: finished.length,
    sef: all.filter((x) => x.variant === "sef").length,
    memur: all.filter((x) => x.variant === "memur").length,
    averageScore: Number(averageScore.toFixed(2)),
    lastEntryAt: all.length ? all[0].startedAt || null : null
  };
}
function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

ensureDB();

app.get("/api/health", (req, res) => {
  const db = readDB();
  res.json({ ok: true, stats: computeStats(db.participants) });
});

app.get("/api/participants", (req, res) => {
  const db = readDB();
  const rows = Array.isArray(db.participants) ? db.participants.slice() : [];
  rows.sort((a, b) => {
    if (!!a.finishedAt !== !!b.finishedAt) return a.finishedAt ? 1 : -1;
    return String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
  });
  res.json(rows);
});

app.get("/api/admin/stats", (req, res) => {
  const db = readDB();
  res.json(computeStats(db.participants));
});

app.get("/api/participants/export.csv", (req, res) => {
  const db = readDB();
  const rows = Array.isArray(db.participants) ? db.participants.slice() : [];
  rows.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
  const header = [
    "Ad Soyad",
    "Varyant",
    "Başlangıç",
    "Bitiş",
    "Doğru",
    "Yanlış",
    "Boş",
    "Puan",
    "Başarı Yüzdesi",
    "Cihaz"
  ];
  const lines = [header.map(escapeCsv).join(",")];
  for (const r of rows) {
    lines.push([
      r.name || "",
      r.variant === "memur" ? "Memurluk" : "Şeflik",
      r.startedAt || "",
      r.finishedAt || "",
      r.correct ?? "",
      r.wrong ?? "",
      r.blank ?? "",
      r.score ?? "",
      r.percent ?? "",
      r.userAgent || ""
    ].map(escapeCsv).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sinava-girenler.csv"');
  res.send("\ufeff" + lines.join("\n"));
});

app.post("/api/exam-enter", (req, res) => {
  const db = readDB();
  const name = String(req.body?.name || "").trim();
  const variant = req.body?.variant === "memur" ? "memur" : "sef";

  if (!name) {
    return res.status(400).json({ error: "name_required" });
  }

  const row = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name,
    variant,
    startedAt: String(req.body?.startedAt || nowIso()),
    finishedAt: null,
    total: null,
    correct: null,
    wrong: null,
    blank: null,
    percent: null,
    score: null,
    userAgent: String(req.body?.userAgent || "")
  };

  db.participants.push(row);
  db.meta.lastEntryAt = row.startedAt;
  writeDB(db);
  res.json(row);
});

app.post("/api/exam-finish", (req, res) => {
  const db = readDB();
  const id = String(req.body?.id || "");
  const row = (db.participants || []).find((x) => x.id === id);

  if (!row) {
    return res.status(404).json({ error: "not_found" });
  }

  row.finishedAt = String(req.body?.finishedAt || nowIso());
  row.total = Number(req.body?.total ?? row.total ?? 0);
  row.correct = Number(req.body?.correct ?? row.correct ?? 0);
  row.wrong = Number(req.body?.wrong ?? row.wrong ?? 0);
  row.blank = Number(req.body?.blank ?? row.blank ?? 0);
  row.percent = Number(req.body?.percent ?? row.percent ?? 0);
  row.score = Number(req.body?.score ?? row.score ?? 0);

  writeDB(db);
  res.json({ ok: true, row });
});

app.post("/api/admin/participants/clear", (req, res) => {
  const db = readDB();
  if (db.participants.length) {
    db.archivedParticipants.push({
      clearedAt: nowIso(),
      count: db.participants.length,
      rows: db.participants
    });
  }
  db.participants = [];
  db.meta.lastClearedAt = nowIso();
  writeDB(db);
  res.json({ ok: true });
});

app.use(express.static(ROOT));

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});