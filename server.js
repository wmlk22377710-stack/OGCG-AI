
"use strict";

const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// Allow requests only from your configured frontend origin.
// Set FRONTEND_ORIGIN in your backend hosting settings.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && FRONTEND_ORIGIN && origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader(
  "Access-Control-Allow-Headers",
  "Content-Type, x-openai-api-key"
);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  } else if (origin && origin !== FRONTEND_ORIGIN) {
    return res.status(403).json({
      error: "This website is not allowed to access the backend."
    });
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "OGCG AI Router backend"
  });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = req.get("x-openai-api-key");
  const task = req.body && req.body.task;

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({
      error: "Enter your OpenAI API key in provider settings."
    });
  }

  if (typeof task !== "string" || !task.trim()) {
    return res.status(400).json({
      error: "Enter a coding task before sending."
    });
  }

  if (task.length > 12000) {
    return res.status(413).json({
      error: "The task is too long. Please shorten it."
    });
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: task.trim()
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status;

      if (status === 401) {
        return res.status(401).json({
          error: "OpenAI rejected the API key. Check that it is valid."
        });
      }

      if (status === 429) {
        return res.status(429).json({
          error: "OpenAI rate limit or usage limit reached. Check your API account."
        });
      }

      return res.status(502).json({
        error: "OpenAI request failed.",
        providerStatus: status,
        details: data.error?.message || "The provider returned an error."
      });
    }

    const text = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n");

    if (!text) {
      return res.status(502).json({
        error: "OpenAI returned no text for this request."
      });
    }

    return res.json({
      ok: true,
      provider: "openai",
      text
    });
  } catch (error) {
    // Do not log headers, API keys, or request bodies.
    if (error.name === "TimeoutError" ||
        error.name === "AbortError") {
      return res.status(504).json({
        error: "The OpenAI request timed out. Please try again."
      });
    }

    return res.status(502).json({
      error: "Could not reach OpenAI. Check the backend connection and try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OGCG AI backend listening on port ${PORT}`);
});
      
