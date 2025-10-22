// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { randomBytes } from "crypto"; // ✅ Only one import

// ✅ Load environment variables
dotenv.config({ path: "./.env" });

console.log("🔑 OpenRouter Key loaded?", !!process.env.OPENROUTER_API_KEY);

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

// --- Chatbot Route ---
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
Services offered: ${Object.values(knowledgeData.services || {})
      .flat()
      .join(", ")}
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
      max_tokens: 250,
    });

    let reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I didn’t quite catch that.";

    reply = reply.replace(/<\/?s>/gi, "").trim();

    console.log(`🤖 Reply: ${reply}`);
    res.json({ reply });
  } catch (error) {
    console.error("❌ Error generating response:", error);
    res.status(500).json({
      reply:
        "⚠️ Sorry, I'm having trouble responding right now. Please try again shortly.",
    });
  }
});

// --- Health Check Route ---
app.get("/", (req, res) => {
  res.send("✅ MikrodTech Chatbot Server is running with Knowledge Base!");
});

import { Readable } from "stream"; // ✅ Keep this one (moved below chatbot)

// --- DOWNLOAD SPEED TEST ---
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
// 🚀 START SERVER
// ====================================================
app.listen(PORT, () => {
  console.log(`🚀 MikrodTech chatbot server running on port ${PORT}`);
});
