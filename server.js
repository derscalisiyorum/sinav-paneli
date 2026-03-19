const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "db.json");

function ensureDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ participants: [] }, null, 2), "utf8");
  }
}
function readDB() {
  ensureDB();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    return { participants: [] };
  }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}
function nowIso() {
  return new Date().toLocaleString("tr-TR");
}

ensureDB();

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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
  writeDB({ participants: [] });
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
