
const http = require("http");

const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://wmlk22377710-stack.github.io";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-openai-api-key, x-gemini-api-key",
    "Vary": "Origin"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON request"));
      }
    });
    req.on("error", reject);
  });
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
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      data.error?.message || "OpenAI request failed"
    );
    err.status = response.status;
    throw err;
  }

  const text = (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n");

  return text || "OpenAI returned an empty response.";
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
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      data.error?.message || "Gemini request failed"
    );
    err.status = response.status;
    throw err;
  }

  const text = (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("");

  return text || "Gemini returned no text. Check the prompt or model availability.";
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (origin && origin !== FRONTEND_ORIGIN) {
    return send(res, 403, {
      ok: false,
      error: "Origin not allowed."
    });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, x-openai-api-key, x-gemini-api-key",
      "Vary": "Origin"
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    return send(res, 200, {
      ok: true,
      service: "OGCG AI Router backend",
      providers: ["openai", "gemini"]
    });
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    return send(res, 404, {
      ok: false,
      error: "Endpoint not found."
    });
  }

  try {
    const body = await readBody(req);
    const task = typeof body.task === "string"
      ? body.task.trim()
      : "";
    const provider = String(body.provider || "openai").toLowerCase();

    if (!task) {
      return send(res, 400, {
        ok: false,
        error: "Enter a task or prompt first."
      });
    }

    let text;

    if (provider === "openai") {
      const key = req.headers["x-openai-api-key"];
      if (!key) {
        return send(res, 400, {
          ok: false,
          error: "Enter your OpenAI API key in Settings."
        });
      }
      text = await callOpenAI(key, task);
    } else if (provider === "gemini") {
      const key = req.headers["x-gemini-api-key"];
      if (!key) {
        return send(res, 400, {
          ok: false,
          error: "Enter your Gemini API key in Settings."
        });
      }
      text = await callGemini(key, task);
    } else {
      return send(res, 400, {
        ok: false,
        error: "Provider not integrated yet. Choose OpenAI or Gemini."
      });
    }

    return send(res, 200, {
      ok: true,
      provider,
      text
    });
  } catch (error) {
    const status = error.status || 500;
    let message = error.message || "Unexpected backend error.";

    if (status === 429) {
      message =
        "Rate limit or API quota reached. Check this provider's usage and billing.";
    } else if (status === 401 || status === 403) {
      message =
        "Authentication or permission failed. Check the API key and provider access.";
    }

    return send(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      error: message
    });
  }
});

server.listen(PORT, () => {
  console.log(`OGCG AI Router backend listening on port ${PORT}`);
});
