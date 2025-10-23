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
      console.log(`📤 Received ${totalBytes / (1024 * 1024)} MB upload`);
      res.json({ status: "ok", receivedMB: (totalBytes / (1024 * 1024)).toFixed(2) });
    });
  } catch (err) {
    console.error("Upload test error:", err);
    res.status(500).json({ error: "Upload test failed" });
  }
});

// ====================================================
// 🚀 START SERVER
// ====================================================
app.listen(PORT, () => {
  console.log(`🚀 MikrodTech chatbot server running on port ${PORT}`);
});
