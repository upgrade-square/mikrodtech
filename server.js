// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { randomBytes } from "crypto";
import { Readable } from "stream"; 
import path from "path";

// ✅ Load environment variables
dotenv.config({ path: "./.env" });

// 🔍 Check API Key
if (!process.env.OPENROUTER_API_KEY) {
  console.warn("⚠️ Warning: OPENROUTER_API_KEY is NOT set. Chatbot requests will fail.");
} else {
  console.log("🔑 OpenRouter Key loaded?", !!process.env.OPENROUTER_API_KEY);
}

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(express.static("public")); // Serve APK and static files

// --- Load MikrodTech Knowledge Base ---
let knowledgeData = {};
try {
  const data = fs.readFileSync("./knowledge.json", "utf8");
  knowledgeData = JSON.parse(data);
  console.log("📘 MikrodTech Knowledge Base loaded successfully.");
} catch (err) {
  console.error("⚠️ Could not load knowledge.json file:", err.message);
}

// --- OpenAI Client via OpenRouter ---
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "MikrodTech Backend",
  },
});

// ====================================================
// 💬 CHATBOT ROUTE
// ====================================================
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") return res.status(400).json({ reply: "Please provide a valid message." });

    console.log(`💬 User: ${message}`);

    const systemPrompt = `
You are MikrodTech's official AI assistant.
Use the following company information to answer user questions accurately and professionally.

Company name: ${knowledgeData.company}
Tagline: ${knowledgeData.tagline}
Mission: ${knowledgeData.mission}
Vision: ${knowledgeData.vision}
Core values: ${knowledgeData.core_values?.join(", ")}

Here is MikrodTech’s current services catalog:
${JSON.stringify(knowledgeData.services, null, 2)}

Contact: ${knowledgeData.contact_info?.phone}, ${knowledgeData.contact_info?.email}
Tone: ${knowledgeData.branding?.tone}

If the question is unrelated to MikrodTech, respond politely but briefly.
Never make up information. Keep replies concise and professional.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });

    let reply = completion.choices?.[0]?.message?.content?.trim() || "Sorry, I didn’t quite catch that.";
    reply = reply.replace(/<\/?s>/gi, "").trim();

    console.log(`🤖 Reply: ${reply}`);
    res.json({ reply });

  } catch (error) {
    console.error("❌ Error generating response:", error);
    res.status(500).json({ reply: "⚠️ Sorry, I'm having trouble responding right now. Please try again shortly." });
  }
});

// ====================================================
// 🩺 HEALTH CHECK ROUTE
// ====================================================
app.get("/", (req, res) => {
  res.send("✅ MikrodTech Chatbot Server is running with Knowledge Base!");
});

// ====================================================
// 🚀 DOWNLOAD SPEED TEST ROUTE
// ====================================================
app.get("/api/speedtest/download", (req, res) => {
  const sizeMB = Math.min(Math.max(parseInt(req.query.size) || 50, 1), 200);
  const totalBytes = sizeMB * 1024 * 1024;

  res.set({
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  });

  const chunkSize = 128 * 1024;
  let sent = 0;

  const stream = new Readable({
    read() {
      if (sent >= totalBytes) return this.push(null);
      const chunk = randomBytes(Math.min(chunkSize, totalBytes - sent));
      sent += chunk.length;
      this.push(chunk);
    }
  });

  stream.pipe(res);
});

// ====================================================
// ⚡ UPLOAD SPEED TEST ROUTE
// ====================================================
app.post("/api/speedtest/upload", async (req, res) => {
  try {
    const sizeMB = Math.min(Math.max(parseInt(req.query.size) || 10, 1), 100);
    const chunks = [];

    req.on("data", (chunk) => { chunks.push(chunk); });
    req.on("end", () => {
      const totalBytes = Buffer.concat(chunks).length;
      console.log(`📤 Received ${(totalBytes / (1024 * 1024)).toFixed(2)} MB upload`);
      res.json({ status: "ok", receivedMB: (totalBytes / (1024 * 1024)).toFixed(2) });
    });
  } catch (err) {
    console.error("Upload test error:", err);
    res.status(500).json({ error: "Upload test failed" });
  }
});

// ====================================================
// ⚡ PING SPEED TEST ROUTE
// ====================================================
app.get("/api/speedtest/ping", async (req, res) => {
  const simulatedLatency = Math.random() * 50 + 10;
  await new Promise((resolve) => setTimeout(resolve, simulatedLatency));
  res.json({ message: "pong", latency: simulatedLatency.toFixed(2) });
});

// ====================================================
// ✅ MDT REMIND DOWNLOADS & REVIEWS
// ====================================================
const DOWNLOAD_FILE = path.join(process.cwd(), "downloads.json");

function loadDownloadData() {
  try {
    if (!fs.existsSync(DOWNLOAD_FILE)) {
      const initialData = { "mdt-remind": 1200, reviews: [] };
      fs.writeFileSync(DOWNLOAD_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    return JSON.parse(fs.readFileSync(DOWNLOAD_FILE, "utf8"));
  } catch (err) {
    console.error("Error loading downloads.json:", err);
    return { "mdt-remind": 1200, reviews: [] };
  }
}

function saveDownloadData(data) {
  try {
    fs.writeFileSync(DOWNLOAD_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving downloads.json:", err);
  }
}

let downloadData = loadDownloadData();

// GET current download count
app.get("/downloads/mdt-remind", (req, res) => {
  res.json({ count: downloadData["mdt-remind"] });
});

// POST increment download
app.post("/downloads/mdt-remind", (req, res) => {
  downloadData["mdt-remind"]++;
  saveDownloadData(downloadData);
  res.json({ count: downloadData["mdt-remind"] });
});


app.get("/download/mdt-remind", (req, res) => {
  // Increment download counter
  downloadData["mdt-remind"]++;
  saveDownloadData(downloadData);

  // Correct path: APK is in 'frontend' folder
  const filePath = path.join(__dirname, "frontend/MDT-Remind.apk");

  if (!fs.existsSync(filePath)) {
    console.error("APK file not found:", filePath);
    return res.status(404).send("APK file not found");
  }

  // Send the file
  res.download(filePath, "MDT-Remind.apk", (err) => {
    if (err) {
      console.error("Download error:", err);
      res.status(500).send("Download failed.");
    }
  });
});


// GET reviews
app.get("/reviews/mdt-remind", (req, res) => {
  res.json(downloadData.reviews || []);
});

// POST new review //
app.post("/reviews/mdt-remind", (req, res) => {
  const { name, rating, comment } = req.body;

  if (!name || !rating || !comment) {
    return res.status(400).json({ error: "Name, rating and comment are required." });
  }

  const review = {
    name: name.trim(),
    rating: Number(rating),
    comment: comment.trim(),
    date: new Date().toISOString() // store ISO date
  };

  downloadData.reviews.push(review);
  saveDownloadData(downloadData);

  res.json({ success: true, review });

});

// ====================================================
// =====================
// WEBSITE VISIT COUNTER
// =====================


const COUNTER_FILE = path.join(process.cwd(), "visits.json");


function loadVisitData() {
  try {
    if (!fs.existsSync(COUNTER_FILE)) {
      const initialData = { total: 0, daily: {} };
      fs.writeFileSync(COUNTER_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const raw = fs.readFileSync(COUNTER_FILE, "utf8");
    return JSON.parse(raw || '{"total":0,"daily":{}}');
  } catch (err) {
    console.error("Error loading visits.json:", err);
    return { total: 0, daily: {} };
  }
}

function saveVisitData(data) {
  try { fs.writeFileSync(COUNTER_FILE, JSON.stringify(data, null, 2)); }
  catch (err) { console.error("Error saving visits.json:", err); }
}

let visitData = loadVisitData();

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    const today = new Date().toISOString().split("T")[0];
    visitData.total++;
    visitData.daily[today] = (visitData.daily[today] || 0) + 1;
    saveVisitData(visitData);
  }
  next();
});

app.get("/api/visits", (req, res) => { res.json(visitData); });

// ====================================================
// 🚀 START SERVER
// ====================================================

// Serve MDT Remind without .html
app.get("/mdt-remind", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend/mdt-remind.html"));
});
// Serve Privacy Policy without .html
app.get("/privacy", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend/privacy.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend/privacy.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 MikrodTech chatbot server running on port ${PORT}`);
});

// IN GOD I PUT MY TRUST. Christ Is Lord