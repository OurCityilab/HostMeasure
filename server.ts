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

  // Helper: Classify Gemini errors into rate_limit | quota_exhausted | invalid_key | other
  function classifyGeminiError(err: unknown): {
    reason: "rate_limit" | "quota_exhausted" | "invalid_key" | "other";
    status: number;
    error: string;
  } {
    const rawMsg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err || "Unknown error");

    const rawStatus =
      (err as any)?.status ||
      (err as any)?.statusCode ||
      (err as any)?.response?.status ||
      0;

    console.error("[Gemini API Error Encountered]", {
      status: rawStatus,
      message: rawMsg,
    });

    const lower = rawMsg.toLowerCase();

    // Check invalid key
    if (
      rawStatus === 401 ||
      rawStatus === 403 ||
      lower.includes("api_key_invalid") ||
      lower.includes("api key not valid") ||
      lower.includes("invalid api key") ||
      lower.includes("unregistered callers") ||
      lower.includes("api key expired") ||
      lower.includes("permission_denied") ||
      lower.includes("forbidden")
    ) {
      return {
        reason: "invalid_key",
        status: 401,
        error: "Invalid Gemini API key or credentials.",
      };
    }

    // Check quota exhausted
    if (
      lower.includes("quota") ||
      lower.includes("exceeded your current quota") ||
      lower.includes("quota exceeded") ||
      lower.includes("free tier limit") ||
      lower.includes("check quota")
    ) {
      return {
        reason: "quota_exhausted",
        status: 429,
        error: "The Gemini quota is used up.",
      };
    }

    // Check transient rate limit
    if (
      rawStatus === 429 ||
      lower.includes("429") ||
      lower.includes("resource_exhausted") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests")
    ) {
      return {
        reason: "rate_limit",
        status: 429,
        error: "Gemini's rate limit was reached. Wait a minute, then resume.",
      };
    }

    // Check 503 / overloaded
    if (
      rawStatus === 503 ||
      lower.includes("503") ||
      lower.includes("service unavailable") ||
      lower.includes("overloaded")
    ) {
      return {
        reason: "rate_limit",
        status: 503,
        error: "Gemini service is temporarily overloaded. Wait a moment, then resume.",
      };
    }

    return {
      reason: "other",
      status: rawStatus && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 502,
      error: rawMsg || "Gemini analysis failed.",
    };
  }

  const RETRY_DELAYS = [2000, 5000, 10000];

  // Helper: Retry up to 3 times on HTTP 429 or 503, waiting 2s, 5s, then 10s
  async function callGeminiWithRetry<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<{
    data?: T;
    errorResult?: {
      reason: "rate_limit" | "quota_exhausted" | "invalid_key" | "other";
      status: number;
      error: string;
    };
  }> {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const data = await fn();
        return { data };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const rawStatus =
          (err as any)?.status ||
          (err as any)?.statusCode ||
          (err as any)?.response?.status;
        const lower = msg.toLowerCase();

        const isRateOr503 =
          rawStatus === 429 ||
          rawStatus === 503 ||
          lower.includes("429") ||
          lower.includes("503") ||
          lower.includes("rate limit") ||
          lower.includes("resource_exhausted") ||
          lower.includes("overloaded") ||
          lower.includes("service unavailable");

        console.error(
          `[Gemini ${label}] Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1} failed: ${msg}`
        );

        if (isRateOr503 && attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          console.log(`[Gemini ${label}] Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        break;
      }
    }

    const classified = classifyGeminiError(lastErr);
    return { errorResult: classified };
  }

  // Method 1 - AI Analysis: score a single photo blindly using only fixed elements on the 1-6 scale
  app.post("/api/analyze-single-photo", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(401).json({
          error: "Gemini API key is not configured.",
          reason: "invalid_key",
        });
      }

      const { photoId, room, mimeType, data } = req.body as {
        photoId?: string;
        room?: string;
        mimeType?: string;
        data?: string;
      };

      if (!photoId || !data) {
        return res.status(400).json({
          error: "Missing required photo data.",
          reason: "other",
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

      const promptText = `You are a residential property condition appraiser evaluating a single photo (Photo ID: ${photoId}${room && room !== "Untagged" ? `, Prior tag: ${room}` : ""}).

ROOM CLASSIFICATION RULES:
Classify the room shown in the photo into one of: "Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior", or "Other".
- Return room "Other" when the photo is a view, street scene, skyline, neighbourhood, map, floor plan, amenity or shared area.
- "Exterior" applies ONLY when the photo shows the property's own facade, roof, or siding up close; a view taken from or near the property is "Other".
- If the photo shows multiple interior spaces, pick the dominant room type.

CONDITION SCORING RULES:
- If the photo is classified as "Other", it is NOT a residential room. Set score to null, isNa to true, and note the subject in observations (e.g. "Street scene", "Skyline view").
- For residential rooms ("Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior"), set isNa to false and score ONLY fixed architectural elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) for material quality, wear, and visible defects.
- Strictly IGNORE furniture, decor, staging, lighting, photo quality, people, and anything about the neighbourhood.
- Use this exact 1 to 6 scale (Fannie Mae C1-C6 reversed so higher is better):
  6 = New or fully renovated; nothing to repair (C1)
  5 = Recently updated; no deferred maintenance (C2)
  4 = Well maintained; normal wear only (C3)
  3 = Some minor repairs or dated finishes (C4)
  2 = Obvious deferred maintenance; needs significant repair (C5)
  1 = Substantial damage; affects safety or livability (C6)

Return strict JSON with:
- photoId: "${photoId}"
- room: "Kitchen" | "Bathroom" | "Living area" | "Bedroom" | "Exterior" | "Other"
- score: integer 1, 2, 3, 4, 5, 6, or null (if room is "Other")
- isNa: boolean (true if room is "Other", false otherwise)
- confidence: "low" | "medium" | "high"
- observations: array of up to 3 short strings describing fixed elements only (or why it is Other).`;

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
            description: "Integer condition score from 1 to 6, or null if room is Other.",
            nullable: true,
          },
          isNa: {
            type: Type.BOOLEAN,
            description: "True if room is Other, false otherwise.",
          },
          confidence: {
            type: Type.STRING,
            description: "One of: low, medium, high",
          },
          observations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Up to 3 short observations.",
          },
        },
        required: ["photoId", "room", "confidence", "observations"],
      };

      const { data: response, errorResult } = await callGeminiWithRetry(
        `analyze-single-photo:${photoId}`,
        () =>
          ai.models.generateContent({
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
          })
      );

      if (errorResult || !response) {
        return res.status(errorResult?.status || 502).json({
          error: errorResult?.error || "AI analysis failed.",
          reason: errorResult?.reason || "other",
        });
      }

      const jsonStr = (response.text ?? "").trim();
      if (!jsonStr) {
        return res.status(502).json({
          error: "Empty response from Gemini.",
          reason: "other",
        });
      }

      const parsed = JSON.parse(jsonStr) as {
        photoId?: string;
        room?: string;
        score?: number | null;
        isNa?: boolean;
        confidence?: string;
        observations?: string[];
      };

      const classifiedRoom = String(parsed.room ?? (room || "Other")).trim();
      const isOther = classifiedRoom === "Other" || parsed.isNa === true;

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

      if (isOther) {
        return res.json({
          photoId,
          room: "Other",
          score: null,
          isNa: true,
          confidence,
          observations:
            observations.length > 0
              ? observations
              : ["Not a room (view, street scene, map, or amenity)"],
        });
      }

      const intScore = Math.round(Number(parsed.score));
      if (!Number.isFinite(intScore) || intScore < 1 || intScore > 6) {
        return res.status(502).json({
          error: "Invalid condition score returned from Gemini.",
          reason: "other",
        });
      }

      return res.json({
        photoId,
        room: classifiedRoom,
        score: intScore,
        isNa: false,
        confidence,
        observations,
      });
    } catch (err) {
      console.error("[analyze-single-photo handler error]", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Internal server error",
        reason: "other",
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
        return res.status(401).json({
          error: "Gemini API key is not configured.",
          reason: "invalid_key",
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
          reason: "other",
        });
      }

      if (!fetchRes.ok) {
        return res.status(502).json({
          error: `Failed to fetch cover photo (HTTP ${fetchRes.status} ${fetchRes.statusText})`,
          reason: "other",
        });
      }

      const contentType = fetchRes.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        return res.status(502).json({
          error: `Remote file is not an image (Content-Type: ${contentType})`,
          reason: "other",
        });
      }

      const arrayBuf = await fetchRes.arrayBuffer();
      if (arrayBuf.byteLength > 8 * 1024 * 1024) {
        return res.status(502).json({
          error: `Image size exceeds 8MB limit (${Math.round(
            arrayBuf.byteLength / 1024
          )} KB)`,
          reason: "other",
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

ROOM CLASSIFICATION RULES:
Classify the room shown in the photo into one of: "Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior", or "Other".
- Return room "Other" when the photo is a view, street scene, skyline, neighbourhood, map, floor plan, amenity or shared area.
- "Exterior" applies ONLY when the photo shows the property's own facade, roof, or siding up close; a view taken from or near the property is "Other".
- If the photo shows multiple interior spaces, pick the dominant room type.

CONDITION SCORING RULES:
- If the photo is classified as "Other", it is NOT a residential room. Set score to null, isNa to true, and note the subject in observations (e.g. "Street scene", "Skyline view").
- For residential rooms ("Kitchen", "Bathroom", "Living area", "Bedroom", "Exterior"), set isNa to false and score ONLY fixed architectural elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) for material quality, wear, and visible defects.
- Strictly IGNORE furniture, decor, staging, lighting, photo quality, people, and anything about the neighbourhood.
- Use this exact 1 to 6 scale (Fannie Mae C1-C6 reversed so higher is better):
  6 = New or fully renovated; nothing to repair (C1)
  5 = Recently updated; no deferred maintenance (C2)
  4 = Well maintained; normal wear only (C3)
  3 = Some minor repairs or dated finishes (C4)
  2 = Obvious deferred maintenance; needs significant repair (C5)
  1 = Substantial damage; affects safety or livability (C6)

Return strict JSON with:
- photoId: "${photoId}"
- room: "Kitchen" | "Bathroom" | "Living area" | "Bedroom" | "Exterior" | "Other"
- score: integer 1, 2, 3, 4, 5, 6, or null (if room is "Other")
- isNa: boolean (true if room is "Other", false otherwise)
- confidence: "low" | "medium" | "high"
- observations: array of up to 3 short strings describing fixed elements only (or why it is Other).`;

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
            description: "Integer condition score from 1 to 6, or null if room is Other.",
            nullable: true,
          },
          isNa: {
            type: Type.BOOLEAN,
            description: "True if room is Other, false otherwise.",
          },
          confidence: {
            type: Type.STRING,
            description: "One of: low, medium, high",
          },
          observations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Up to 3 short observations.",
          },
        },
        required: ["photoId", "room", "confidence", "observations"],
      };

      const { data: response, errorResult } = await callGeminiWithRetry(
        `rate-cover-photo:${photoId}`,
        () =>
          ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: {
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: promptText },
              ],
            },
            config: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema,
            },
          })
      );

      if (errorResult || !response) {
        return res.status(errorResult?.status || 502).json({
          error: errorResult?.error || "AI analysis failed.",
          reason: errorResult?.reason || "other",
        });
      }

      const jsonStr = (response.text ?? "").trim();
      if (!jsonStr) {
        return res.status(502).json({
          error: "Empty response from Gemini.",
          reason: "other",
        });
      }

      const parsed = JSON.parse(jsonStr) as {
        photoId?: string;
        room?: string;
        score?: number | null;
        isNa?: boolean;
        confidence?: string;
        observations?: string[];
      };

      const classifiedRoom = String(parsed.room ?? "Other").trim();
      const isOther = classifiedRoom === "Other" || parsed.isNa === true;

      const confRaw = String(parsed.confidence ?? "low").trim().toLowerCase();
      const confidence: "low" | "medium" | "high" =
        confRaw === "high" || confRaw === "medium" ? confRaw : "low";

      const observations = Array.isArray(parsed.observations)
        ? parsed.observations
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (isOther) {
        return res.json({
          photoId,
          room: "Other",
          score: null,
          isNa: true,
          confidence,
          observations:
            observations.length > 0
              ? observations
              : ["Not a room (view, street scene, map, or amenity)"],
          source: "cover",
        });
      }

      const intScore = Math.round(Number(parsed.score));
      if (!Number.isFinite(intScore) || intScore < 1 || intScore > 6) {
        return res.status(502).json({
          error: "Invalid condition score returned.",
          reason: "other",
        });
      }

      return res.json({
        photoId,
        room: classifiedRoom,
        score: intScore,
        isNa: false,
        confidence,
        observations,
        source: "cover",
      });
    } catch (err) {
      console.error("[rate-cover-photo handler error]", err);
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : "Server error rating cover photo",
        reason: "other",
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
