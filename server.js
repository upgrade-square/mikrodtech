// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { randomBytes } from "crypto";
import { Readable } from "stream"; 
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";


const ADMIN_KEY = process.env.ADMIN_KEY || "dev_secret_key";
dotenv.config();


// ✅ Load environment variables
dotenv.config({ path: "./.env" });

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("⚠️ OPENROUTER_API_KEY not set. Chatbot requests will fail.");
} else {
  console.log("🔑 OpenRouter API key loaded");
}

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public")); // Serve static files

// --- SQLite Setup ---
const dbPromise = open({
  filename: "./mdtremind.db",
  driver: sqlite3.Database
});

(async () => {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      app TEXT PRIMARY KEY,
      count INTEGER
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app TEXT,
      name TEXT,
      rating INTEGER,
      comment TEXT,
      date TEXT
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      count INTEGER
    );
  `);

  // Initialize download count if missing
  const row = await db.get(`SELECT count FROM downloads WHERE app="mdt-remind"`);
  if (!row) {
    await db.run(`INSERT INTO downloads(app, count) VALUES("mdt-remind", 1200)`);
  }
})();

// --- OpenAI Client ---
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "MikrodTech Backend",
  },
});

// ===========================
// 💬 CHATBOT ROUTE
// ===========================
let knowledgeData = {};
try {
  knowledgeData = JSON.parse(fs.readFileSync("./knowledge.json", "utf8"));
  console.log("📘 Knowledge base loaded.");
} catch (err) {
  console.error("⚠️ Could not load knowledge.json", err.message);
}

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") return res.status(400).json({ reply: "Please provide a valid message." });

    const systemPrompt = `
You are MikrodTech's AI assistant.
Company info: ${knowledgeData.company || "N/A"}, tagline: ${knowledgeData.tagline || "N/A"}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 1200
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "Sorry, I didn’t catch that.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Error generating response" });
  }
});

// ===========================
// 🚀 DOWNLOADS & REVIEWS
// ===========================
app.get("/downloads/mdt-remind", async (req, res) => {
  const db = await dbPromise;
  const row = await db.get(`SELECT count FROM downloads WHERE app="mdt-remind"`);
  res.json({ count: row?.count || 0 });
});

app.post("/downloads/mdt-remind", async (req, res) => {
  const db = await dbPromise;
  await db.run(`INSERT INTO downloads(app, count) VALUES("mdt-remind",1)
                ON CONFLICT(app) DO UPDATE SET count=count+1`);
  const row = await db.get(`SELECT count FROM downloads WHERE app="mdt-remind"`);
  res.json({ count: row.count });
});


app.get("/download/mdt-remind", (req, res) => {
  try {
    // Increment download count
    downloadData["mdt-remind"]++;
    saveDownloadData(downloadData);

    // File path (same folder as server.js)
    const filePath = path.join(process.cwd(), "MDT-Remind.apk");

    if (!fs.existsSync(filePath)) {
      console.error("APK not found:", filePath);
      return res.status(404).send("APK file not found");
    }

    res.download(filePath, "MDT-Remind.apk");

  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Download failed");
  }
});




// --- Reviews ---
app.get("/reviews/mdt-remind", async (req, res) => {
  const db = await dbPromise;
  const reviews = await db.all(`SELECT * FROM reviews WHERE app="mdt-remind" ORDER BY date ASC`);
  res.json(reviews);
});

app.post("/reviews/mdt-remind", async (req, res) => {
  const { name, rating, comment } = req.body;
  if (!name || !rating || !comment) return res.status(400).json({ error: "Missing fields" });

  const db = await dbPromise;
  const date = new Date().toISOString();
  await db.run(
    `INSERT INTO reviews(app, name, rating, comment, date) VALUES (?, ?, ?, ?, ?)`,
    ["mdt-remind", name.trim(), Number(rating), comment.trim(), date]
  );

  const review = await db.get(`SELECT * FROM reviews WHERE rowid = last_insert_rowid()`);
  res.json({ success: true, review });
});


//=============================
// MY ADMIN PANEL
//=============================
app.get("/admin/downloads/mdt-remind", (req, res) => {
  const key = req.query.key;

  // Check if key is correct
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Return download count (private)
  res.json({ count: downloadData["mdt-remind"] });
});




// ===========================
// 🩺 HEALTH CHECK
// ===========================
app.get("/", (req, res) => res.send("✅ MikrodTech server running!"));

// ===========================
// ⚡ SPEED TESTS
// ===========================
app.get("/api/speedtest/download", (req, res) => {
  const sizeMB = Math.min(Math.max(parseInt(req.query.size) || 50, 1), 200);
  const totalBytes = sizeMB * 1024 * 1024;
  const stream = new Readable({
    read() {
      if (this.sent >= totalBytes) return this.push(null);
      const chunk = randomBytes(Math.min(128 * 1024, totalBytes - (this.sent || 0)));
      this.sent = (this.sent || 0) + chunk.length;
      this.push(chunk);
    }
  });
  res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
  stream.pipe(res);
});

app.post("/api/speedtest/upload", (req, res) => {
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const totalBytes = Buffer.concat(chunks).length;
    res.json({ receivedMB: (totalBytes / (1024*1024)).toFixed(2) });
  });
});

app.get("/api/speedtest/ping", async (req, res) => {
  await new Promise(r => setTimeout(r, Math.random()*50+10));
  res.json({ message: "pong" });
});

// ===========================
// ⚡ VISITS
// ===========================
app.use(async (req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    const db = await dbPromise;
    const today = new Date().toISOString().split("T")[0];
    const row = await db.get(`SELECT * FROM visits WHERE date = ?`, today);
    if (row) {
      await db.run(`UPDATE visits SET count = count + 1 WHERE date = ?`, today);
    } else {
      await db.run(`INSERT INTO visits(date, count) VALUES(?, 1)`, today);
    }
  }
  next();
});

// ===========================
// 🗂 STATIC FILE ROUTES
// ===========================
app.get("/mdt-remind", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend/mdt-remind.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend/privacy.html"));
});

// ===========================
// 🚀 START SERVER
// ===========================
app.listen(PORT, () => {
  console.log(`🚀 MikrodTech server running on port ${PORT}`);
});