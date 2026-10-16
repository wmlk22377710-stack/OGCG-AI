
"use strict";

// OGCG AI — Multi AI Router
// OpenAI requests are sent through the Render backend.
// API keys are kept in memory only and cleared on page refresh.

const BACKEND_URL = "https://ogcg-ai-1.onrender.com";

const PROVIDERS = {
  openai: { name: "OpenAI", description: "GPT models" },
  gemini: { name: "Gemini", description: "Google AI models" },
  claude: { name: "Claude", description: "Anthropic models" },
  grok: { name: "Grok", description: "xAI models" }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const providerInputs = $$('input[name="provider"]');
const selectionCount = $("#selectionCount");
const selectAllButton = $("#selectAll");
const taskInput = $("#taskInput");
const runTaskButton = $("#runTask");
const message = $("#message");
const results = $("#results");
const resultContent = $("#resultContent");

const chatScreen = $("#chatScreen");
const settingsScreen = $("#settingsScreen");
const settingsNav = $("#settingsNav");
const backToChat = $("#backToChat");
const newChatButton = $("#newChat");

const providerChoice = $("#providerChoice");
const providerHelp = $("#providerHelp");
const apiKeyInput = $("#apiKeyInput");
const connectProviderButton = $("#connectProvider");
const connectionInfo = $("#connectionInfo");
const settingsMessage = $("#settingsMessage");

// Intentionally not saved to localStorage, sessionStorage, or cookies.
let openAIKey = "";
let openAIConnected = false;
let isRunning = false;
let isConnecting = false;

function getSelectedProviders() {
  return providerInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function updateSelectionUI() {
  const selected = getSelectedProviders();
  selectionCount.textContent =
    `${selected.length} provider${selected.length === 1 ? "" : "s"} selected`;

  selectAllButton.textContent =
    selected.length === providerInputs.length ? "Deselect all" : "Select all";
}

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type ? `message ${type}` : "message";
}

function showSettingsMessage(text, type = "") {
  settingsMessage.textContent = text;
  settingsMessage.className = type ? `message ${type}` : "message";
}

function setProviderStatus(providerId, text) {
  const status = $(`[data-status="${providerId}"]`);
  if (status) status.textContent = text;
}

function openSettings(provider = null) {
  chatScreen.hidden = true;
  settingsScreen.hidden = false;

  if (provider && PROVIDERS[provider]) {
    providerChoice.value = provider;
  }

  updateProviderHelp();
  showSettingsMessage("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openChat() {
  settingsScreen.hidden = true;
  chatScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateProviderHelp() {
  const provider = PROVIDERS[providerChoice.value];
  if (!provider) return;

  if (providerChoice.value === "openai") {
    providerHelp.textContent =
      "OpenAI uses your API key through the OGCG AI backend. API usage may incur charges.";
  } else {
    providerHelp.textContent =
      `${provider.name}: ${provider.description}. This provider integration is not available yet.`;
  }
}

function makeResultCard(providerName, statusText, bodyText = "") {
  const card = document.createElement("article");
  card.className = "result-card";

  const heading = document.createElement("strong");
  heading.textContent = providerName;

  const status = document.createElement("p");
  status.textContent = statusText;

  card.append(heading, status);

  if (bodyText) {
    const body = document.createElement("pre");
    body.textContent = bodyText;
    body.style.whiteSpace = "pre-wrap";
    body.style.overflowWrap = "anywhere";
    card.appendChild(body);
  }

  return card;
}

function showResults(cards) {
  resultContent.replaceChildren(...cards);
  results.hidden = cards.length === 0;
}

async function readResponse(response) {
  return response.json().catch(() => ({}));
}

async function handleConnect() {
  if (isConnecting) return;

  const providerId = providerChoice.value;

  if (providerId !== "openai") {
    showSettingsMessage(
      `${PROVIDERS[providerId].name} is not integrated yet. OpenAI is the first supported provider.`,
      "error"
    );
    return;
  }

  const enteredKey = apiKeyInput.value.trim();

  if (!enteredKey) {
    showSettingsMessage("Enter your OpenAI API key first.", "error");
    apiKeyInput.focus();
    return;
  }

  isConnecting = true;
  connectProviderButton.disabled = true;
  connectProviderButton.textContent = "Verifying...";
  showSettingsMessage("Testing the key through your backend...");

  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openai-api-key": enteredKey
      },
      body: JSON.stringify({
        task: "Reply with exactly the word OK."
      })
    });

    const data = await readResponse(response);

    if (!response.ok) {
      throw new Error(data.error || `Connection failed (HTTP ${response.status}).`);
    }

    if (!data.ok || typeof data.text !== "string" || !data.text.trim()) {
      throw new Error("The backend responded, but no AI text was returned.");
    }

    // Keep the key only in page memory after a successful test.
    openAIKey = enteredKey;
    openAIConnected = true;
    apiKeyInput.value = "";
    setProviderStatus("openai", "Connected");
    showSettingsMessage("OpenAI connected successfully. You can now run coding tasks.", "success");
  } catch (error) {
    openAIConnected = false;
    openAIKey = "";
    setProviderStatus("openai", "Not connected");

    const details = error instanceof TypeError
      ? "Could not reach the backend. Check the Render URL, deployment, and CORS configuration."
      : error.message;

    showSettingsMessage(details, "error");
  } finally {
    isConnecting = false;
    connectProviderButton.disabled = false;
    connectProviderButton.textContent = "Connect & Verify";
  }
}

function handleSelectAll() {
  const allSelected = getSelectedProviders().length === providerInputs.length;
  providerInputs.forEach((input) => {
    input.checked = !allSelected;
  });
  updateSelectionUI();
  showMessage("");
}

async function handleRunTask() {
  if (isRunning) return;

  const task = taskInput.value.trim();
  const selectedProviders = getSelectedProviders();

  if (!selectedProviders.length) {
    showMessage("Select at least one AI provider before running a task.", "error");
    results.hidden = true;
    return;
  }

  if (!task) {
    showMessage("Enter a coding task first.", "error");
    taskInput.focus();
    results.hidden = true;
    return;
  }

  if (!selectedProviders.includes("openai")) {
    showMessage("Select OpenAI. It is the only provider integrated in this first version.", "error");
    results.hidden = true;
    return;
  }

  if (!openAIConnected || !openAIKey) {
    showMessage("Open Provider Settings and connect OpenAI before running a task.", "error");
    openSettings("openai");
    return;
  }

  isRunning = true;
  runTaskButton.disabled = true;
  runTaskButton.textContent = "Working...";
  showMessage("Sending your task to OpenAI...");

  const cards = [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openai-api-key": openAIKey
      },
      body: JSON.stringify({ task })
    });

    const data = await readResponse(response);

    if (!response.ok) {
      if (response.status === 401) {
        openAIConnected = false;
        openAIKey = "";
        setProviderStatus("openai", "Not connected");
      }
      throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    }

    if (!data.ok || typeof data.text !== "string" || !data.text.trim()) {
      throw new Error("OpenAI returned no text.");
    }

    cards.push(makeResultCard("OpenAI", "Real AI response", data.text));

    for (const providerId of selectedProviders) {
      if (providerId === "openai") continue;
      cards.push(makeResultCard(
        PROVIDERS[providerId].name,
        "Not connected yet. This provider integration will be added separately."
      ));
    }

    showResults(cards);
    showMessage("OpenAI completed your task.", "success");
  } catch (error) {
    showResults([
      makeResultCard("OpenAI", "Request failed", error.message)
    ]);

    showMessage(error.message, "error");
  } finally {
    isRunning = false;
    runTaskButton.disabled = false;
    runTaskButton.textContent = "Run task ↗";
  }
}

function handleNewChat() {
  taskInput.value = "";
  showMessage("");
  results.hidden = true;
  resultContent.replaceChildren();
  openChat();
  taskInput.focus();
}

function handleConnectClick(event) {
  event.preventDefault();
  event.stopPropagation();
  openSettings(event.currentTarget.dataset.connect);
}

providerInputs.forEach((input) => {
  input.addEventListener("change", () => {
    updateSelectionUI();
    showMessage("");
  });
});

selectAllButton.addEventListener("click", handleSelectAll);
runTaskButton.addEventListener("click", handleRunTask);
connectProviderButton.addEventListener("click", handleConnect);
providerChoice.addEventListener("change", updateProviderHelp);

$$("[data-connect]").forEach((button) => {
  button.addEventListener("click", handleConnectClick);
});

settingsNav.addEventListener("click", () => openSettings());
backToChat.addEventListener("click", openChat);
newChatButton.addEventListener("click", handleNewChat);

updateSelectionUI();
updateProviderHelp();

console.info("OGCG AI frontend initialized.");
