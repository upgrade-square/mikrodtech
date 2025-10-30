// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { randomBytes } from "crypto";
import { Readable } from "stream"; // Keep this import here

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
});

// ====================================================
// 💬 CHATBOT ROUTE
// ====================================================
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ reply: "Please provide a valid message." });
    }

    console.log(`💬 User: ${message}`);

    // --- Include company info as context ---
 const systemPrompt = `
You are MikrodTech's official AI assistant.
Use the following company information to answer user questions accurately and professionally.

Company name: ${knowledgeData.company}
Tagline: ${knowledgeData.tagline}
Mission: ${knowledgeData.mission}
Vision: ${knowledgeData.vision}
Core values: ${knowledgeData.core_values?.join(", ")}
Services offered: ${Object.values(knowledgeData.services || {}).flat().join(", ")}
Contact: ${knowledgeData.contact_info?.phone}, ${knowledgeData.contact_info?.email}
Tone: ${knowledgeData.branding?.tone}

If the question is unrelated to MikrodTech, respond politely but briefly.
Never make up information. Keep replies concise and professional.
Always format your responses as HTML unordered lists (<ul><li>) for clear bullet points.
`;


    // --- Make API Request ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 250,
    });

let reply =
  completion.choices?.[0]?.message?.content?.trim() ||
  "Sorry, I didn’t quite catch that.";

// Clean up unnecessary <s> tags
reply = reply.replace(/<\/?s>/gi, "").trim();

// Send plain text or HTML list (no extra bullets)
res.json({ reply });


    console.log(`🤖 Reply: ${reply}`);
    res.json({ reply });

  } catch (error) {
    console.error("❌ Error generating response (full):", error);

    if (error?.response) {
      console.error("❌ error.response.status:", error.response.status);
      console.error("❌ error.response.data:", error.response.data);
    }

    if (!process.env.OPENROUTER_API_KEY) {
      console.error("❌ OPENROUTER_API_KEY is NOT set (missing in .env)");
    } else {
      console.error("🔑 OPENROUTER_API_KEY appears set.");
    }

    res.status(500).json({
      reply: "⚠️ Sorry, I'm having trouble responding right now. Please try again shortly.",
    });
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

  const chunkSize = 128 * 1024; // 128 KB
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

    // Collect uploaded data
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      const totalBytes = Buffer.concat(chunks).length;
      console.log(`📤 Received ${(totalBytes / (1024 * 1024)).toFixed(2)} MB upload`);
      res.json({
        status: "ok",
        receivedMB: (totalBytes / (1024 * 1024)).toFixed(2)
      });
    });
  } catch (err) {
    console.error("Upload test error:", err);
    res.status(500).json({ error: "Upload test failed" });
  }
});


// ====================================================
// ⚡ PING SPEED TEST ROUTE (Simulated realistic latency)
// ====================================================
app.get("/api/speedtest/ping", async (req, res) => {
  // Simulate realistic latency between 10–60ms
  const simulatedLatency = Math.random() * 50 + 10;

  // Wait for the simulated latency
  await new Promise((resolve) => setTimeout(resolve, simulatedLatency));

  // Respond with latency info
  res.json({ message: "pong", latency: simulatedLatency.toFixed(2) });
});


// ====================================================
// 🚀 START SERVER
// ====================================================
app.listen(PORT, () => {
  console.log(`🚀 MikrodTech chatbot server running on port ${PORT}`);
});
