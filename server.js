
"use strict";

const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://wmlk22377710-stack.github.io";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// CORS: allow the deployed frontend and required provider-key headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && origin !== FRONTEND_ORIGIN) {
    return res.status(403).json({
      ok: false,
      error: "This website is not allowed to access the backend."
    });
  }

  if (origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-openai-api-key, x-gemini-api-key"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "OGCG AI Router backend",
    providers: ["openai", "gemini"]
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "OGCG AI Router backend"
  });
});

function getProviderError(status, data, provider) {
  const detail = data?.error?.message;

  if (status === 401) {
    return `${provider} rejected the API key. Check that it is valid.`;
  }

  if (status === 403) {
    return `${provider} denied access. Check the key, permissions, and API access.`;
  }

  if (status === 429) {
    return `${provider} rate limit or usage quota reached. Check your API account and usage limits.`;
  }

  return detail || `${provider} request failed (HTTP ${status}).`;
}

async function callOpenAI(apiKey, task) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: task
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      getProviderError(response.status, data, "OpenAI")
    );
    error.status = response.status;
    throw error;
  }

  const text = (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n");

  if (!text.trim()) {
    throw new Error("OpenAI returned no text.");
  }

  return text;
}

async function callGemini(apiKey, task) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: task }]
      }]
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      getProviderError(response.status, data, "Gemini")
    );
    error.status = response.status;
    throw error;
  }

  const text = (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("");

  if (!text.trim()) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(
      reason
        ? `Gemini could not answer this prompt. Block reason: ${reason}.`
        : "Gemini returned no text. Check model availability and the prompt."
    );
  }

  return text;
}

app.post("/api/chat", async (req, res) => {
  const task = req.body?.task;
  const provider = String(req.body?.provider || "openai").toLowerCase();

  if (typeof task !== "string" || !task.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Enter a coding task before sending."
    });
  }

  if (task.length > 12000) {
    return res.status(413).json({
      ok: false,
      error: "The task is too long. Please shorten it."
    });
  }

  let apiKey;
  let callProvider;

  if (provider === "openai") {
    apiKey = req.get("x-openai-api-key");
    callProvider = callOpenAI;
  } else if (provider === "gemini") {
    apiKey = req.get("x-gemini-api-key");
    callProvider = callGemini;
  } else {
    return res.status(400).json({
      ok: false,
      error: "Provider not integrated yet. Choose OpenAI or Gemini."
    });
  }

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({
      ok: false,
      error: `Enter your ${provider === "gemini" ? "Gemini" : "OpenAI"} API key in provider settings.`
    });
  }

  try {
    const text = await callProvider(apiKey.trim(), task.trim());

    return res.json({
      ok: true,
      provider,
      text
    });
  } catch (error) {
    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      return res.status(504).json({
        ok: false,
        error: `${provider} request timed out. Please try again.`
      });
    }

    // Never log API keys, request headers, or prompt contents.
    const status = error.status || 502;

    return res.status(status >= 400 && status < 600 ? status : 502).json({
      ok: false,
      error: error.message || `Could not reach ${provider}.`
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OGCG AI Router backend listening on port ${PORT}`);
});
