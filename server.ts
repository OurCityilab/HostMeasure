import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support base64 photo uploads
  app.use(express.json({ limit: "25mb" }));

  // Method 1 - AI Analysis: score a single photo blindly using only fixed elements on the 1-6 scale
  app.post("/api/analyze-single-photo", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(503).json({
          error: "AI analysis unavailable. Use Desk review.",
        });
      }

      const { photoId, room, mimeType, data } = req.body as {
        photoId?: string;
        room?: string;
        mimeType?: string;
        data?: string;
      };

      if (!photoId || !room || !data) {
        return res.status(400).json({
          error: "AI analysis unavailable. Use Desk review.",
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const isUntagged = room === "Untagged" || !room;

      const promptText = isUntagged
        ? `You are a residential property condition appraiser evaluating a single photo (Photo ID: ${photoId}).
The photo room is currently untagged. First, classify the room shown in the photo into one of: "Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior", or "Other".
If the photo shows multiple spaces, pick the dominant room type. If it is a floor plan, map, logo, document, graphic, or cannot be identified as one of the residential spaces, classify it as "Other".

Score ONLY fixed architectural elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) for material quality, wear, and visible defects.
Strictly IGNORE furniture, decor, staging, lighting, photo quality, people, and anything about the neighbourhood.

Use this exact 1 to 6 scale (Fannie Mae C1-C6 reversed so higher is better):
  6 = New or fully renovated; nothing to repair (C1)
  5 = Recently updated; no deferred maintenance (C2)
  4 = Well maintained; normal wear only (C3)
  3 = Some minor repairs or dated finishes (C4)
  2 = Obvious deferred maintenance; needs significant repair (C5)
  1 = Substantial damage; affects safety or livability (C6)

Return strict JSON with:
- photoId: "${photoId}"
- room: "Kitchen" | "Bathroom" | "Living area" | "Bedroom" | "Exterior" | "Other"
- score: integer 1, 2, 3, 4, 5, or 6
- confidence: "low" | "medium" | "high"
- observations: array of up to 3 short strings describing fixed elements only.`
        : `You are a residential property condition appraiser evaluating a single photo (Photo ID: ${photoId}, Room: ${room}).
Score ONLY fixed architectural elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) for material quality, wear, and visible defects.
Strictly IGNORE furniture, decor, staging, lighting, photo quality, people, and anything about the neighbourhood.

Use this exact 1 to 6 scale (Fannie Mae C1-C6 reversed so higher is better):
  6 = New or fully renovated; nothing to repair (C1)
  5 = Recently updated; no deferred maintenance (C2)
  4 = Well maintained; normal wear only (C3)
  3 = Some minor repairs or dated finishes (C4)
  2 = Obvious deferred maintenance; needs significant repair (C5)
  1 = Substantial damage; affects safety or livability (C6)

Return strict JSON with:
- photoId: "${photoId}"
- room: "${room}"
- score: integer 1, 2, 3, 4, 5, or 6
- confidence: "low" | "medium" | "high"
- observations: array of up to 3 short strings describing fixed elements only.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          photoId: { type: Type.STRING },
          room: {
            type: Type.STRING,
            description:
              "One of: Kitchen, Bathroom, Living area, Bedroom, Exterior, Other",
          },
          score: {
            type: Type.INTEGER,
            description: "Integer condition score from 1 to 6 where 6 is best.",
          },
          confidence: {
            type: Type.STRING,
            description: "One of: low, medium, high",
          },
          observations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Up to 3 short observations on fixed elements only.",
          },
        },
        required: ["photoId", "room", "score", "confidence", "observations"],
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema,
          },
        });
      } catch {
        response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });
      }

      const jsonStr = (response.text ?? "").trim();
      if (!jsonStr) {
        return res.status(502).json({
          error: "AI analysis unavailable. Use Desk review.",
        });
      }

      const parsed = JSON.parse(jsonStr) as {
        photoId?: string;
        room?: string;
        score?: number;
        confidence?: string;
        observations?: string[];
      };

      const classifiedRoom = String(parsed.room ?? room).trim();
      if (isUntagged && (classifiedRoom === "Other" || !classifiedRoom)) {
        return res.status(422).json({
          error: "Photo classified as 'Other' (not a recognizable residential room)",
          room: "Other",
        });
      }

      const intScore = Math.round(Number(parsed.score));
      if (!Number.isFinite(intScore) || intScore < 1 || intScore > 6) {
        return res.status(502).json({
          error: "AI analysis unavailable. Use Desk review.",
        });
      }

      const confRaw = String(parsed.confidence ?? "medium")
        .trim()
        .toLowerCase();
      const confidence: "low" | "medium" | "high" =
        confRaw === "low" || confRaw === "high" ? confRaw : "medium";

      const observations = Array.isArray(parsed.observations)
        ? parsed.observations
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      return res.json({
        photoId,
        room: isUntagged ? classifiedRoom : room,
        score: intScore,
        confidence,
        observations,
      });
    } catch {
      return res.status(500).json({
        error: "AI analysis unavailable. Use Desk review.",
      });
    }
  });

  // Method 1 - AI Analysis: rate a listing cover photo fetched from .muscache.com
  app.post("/api/rate-cover-photo", async (req, res) => {
    try {
      const { photoId, url } = req.body as { photoId?: string; url?: string };
      if (!photoId || !url) {
        return res.status(400).json({ error: "Missing photoId or url" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid photo URL" });
      }

      if (
        parsedUrl.protocol !== "https:" ||
        !parsedUrl.hostname.endsWith(".muscache.com")
      ) {
        return res.status(400).json({
          error: "URL must be https and hostname must end with .muscache.com",
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(503).json({
          error: "AI analysis unavailable. Use Desk review.",
        });
      }

      // Fetch url with 12s timeout
      let fetchRes: Response;
      try {
        fetchRes = await fetch(url, {
          signal: AbortSignal.timeout(12000),
        });
      } catch (err) {
        return res.status(502).json({
          error: `Could not fetch cover photo within 12s: ${
            err instanceof Error ? err.message : "Network error"
          }`,
        });
      }

      if (!fetchRes.ok) {
        return res.status(502).json({
          error: `Failed to fetch cover photo (HTTP ${fetchRes.status} ${fetchRes.statusText})`,
        });
      }

      const contentType = fetchRes.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        return res.status(502).json({
          error: `Remote file is not an image (Content-Type: ${contentType})`,
        });
      }

      const arrayBuf = await fetchRes.arrayBuffer();
      if (arrayBuf.byteLength > 8 * 1024 * 1024) {
        return res.status(502).json({
          error: `Image size exceeds 8MB limit (${Math.round(
            arrayBuf.byteLength / 1024
          )} KB)`,
        });
      }

      const base64Data = Buffer.from(arrayBuf).toString("base64");
      const mimeType = contentType.split(";")[0].trim() || "image/jpeg";

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const promptText = `You are a residential property condition appraiser evaluating a single listing cover photo (Photo ID: ${photoId}).
First, classify the room shown in the photo into one of: "Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior", or "Other".
If the photo shows multiple spaces, pick the dominant room type. If it is a floor plan, map, logo, document, graphic, or cannot be identified as one of the residential spaces, classify it as "Other".

Score ONLY fixed architectural elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) for material quality, wear, and visible defects.
Strictly IGNORE furniture, decor, staging, lighting, photo quality, people, and anything about the neighbourhood.

Use this exact 1 to 6 scale (Fannie Mae C1-C6 reversed so higher is better):
  6 = New or fully renovated; nothing to repair (C1)
  5 = Recently updated; no deferred maintenance (C2)
  4 = Well maintained; normal wear only (C3)
  3 = Some minor repairs or dated finishes (C4)
  2 = Obvious deferred maintenance; needs significant repair (C5)
  1 = Substantial damage; affects safety or livability (C6)

Return strict JSON with:
- photoId: "${photoId}"
- room: "Kitchen" | "Bathroom" | "Living area" | "Bedroom" | "Exterior" | "Other"
- score: integer 1, 2, 3, 4, 5, or 6
- confidence: "low" | "medium" | "high"
- observations: array of up to 3 short strings describing fixed elements only.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          photoId: { type: Type.STRING },
          room: {
            type: Type.STRING,
            description:
              "One of: Kitchen, Bathroom, Living area, Bedroom, Exterior, Other",
          },
          score: {
            type: Type.INTEGER,
            description: "Integer condition score from 1 to 6 where 6 is best.",
          },
          confidence: {
            type: Type.STRING,
            description: "One of: low, medium, high",
          },
          observations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Up to 3 short observations on fixed elements only.",
          },
        },
        required: ["photoId", "room", "score", "confidence", "observations"],
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: promptText },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });
      } catch (gErr) {
        return res.status(502).json({
          error: `AI analysis error: ${
            gErr instanceof Error ? gErr.message : "Gemini error"
          }`,
        });
      }

      const jsonStr = (response.text ?? "").trim();
      if (!jsonStr) {
        return res.status(502).json({ error: "Empty response from Gemini." });
      }

      const parsed = JSON.parse(jsonStr) as {
        photoId?: string;
        room?: string;
        score?: number;
        confidence?: string;
        observations?: string[];
      };

      const classifiedRoom = String(parsed.room ?? "").trim();
      if (classifiedRoom === "Other" || !classifiedRoom) {
        return res.status(422).json({
          error:
            "Photo classified as 'Other' (not a recognizable residential room)",
          room: "Other",
        });
      }

      const intScore = Math.round(Number(parsed.score));
      if (!Number.isFinite(intScore) || intScore < 1 || intScore > 6) {
        return res
          .status(502)
          .json({ error: "Invalid condition score returned." });
      }

      const confRaw = String(parsed.confidence ?? "low").trim().toLowerCase();
      const confidence: "low" | "medium" | "high" =
        confRaw === "high" || confRaw === "medium" ? confRaw : "low";

      const observations = Array.isArray(parsed.observations)
        ? parsed.observations
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      return res.json({
        photoId,
        room: classifiedRoom,
        score: intScore,
        confidence,
        observations,
        source: "cover",
      });
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : "Server error rating cover photo",
      });
    }
  });

  // Server-side Gemini endpoint for Step 4 "Explain my result"
  app.post("/api/explain-result", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(503).json({
          error: "GEMINI_API_KEY is not configured on the server.",
        });
      }

      const { payload } = req.body;
      if (!payload) {
        return res
          .status(400)
          .json({ error: "Missing computed numbers payload." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemInstruction = `You are a calm, plain-English financial advisor writing a short verdict for a Washington, DC homeowner considering Airbnb.
Write a single paragraph of about 110 to 130 words using ONLY the exact numbers provided in the JSON payload.
Mandatory rules:
1. State the comp count for both paths.
2. State the nightly rate range and net income range (low, expected, high) for both paths.
3. Explicitly state the binding limit for each path (e.g. 90-night legal cap, owner's available nights, or estimated market demand).
4. Name which path pays more and by how much in expected net income.
5. NEVER invent, calculate, or add any number that was not explicitly supplied in the JSON payload.
6. You MUST end your response with the exact sentence: "Estimate only, not legal or tax advice."`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Write a plain-English verdict (~120 words) from these exact computed figures:\n${JSON.stringify(
          payload,
          null,
          2
        )}`,
        config: {
          systemInstruction,
        },
      });

      let text = (response.text ?? "").trim();
      if (!text) {
        return res
          .status(502)
          .json({ error: "Empty response from Gemini model." });
      }

      if (!text.endsWith("Estimate only, not legal or tax advice.")) {
        text = `${text
          .replace(/Estimate only, not legal or tax advice\.?$/i, "")
          .trim()} Estimate only, not legal or tax advice.`;
      }

      return res.json({ explanation: text, source: "gemini" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate Gemini explanation.";
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HostMeasure DC server listening on http://localhost:${PORT}`);
  });
}

startServer();
