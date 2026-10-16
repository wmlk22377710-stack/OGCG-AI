
"use strict";

// OGCG AI — Multi AI Router
// Provider keys stay in page memory and are cleared on refresh.

const BACKEND_URL = "https://ogcg-ai-1.onrender.com";

const PROVIDERS = {
  openai: {
    name: "OpenAI",
    description: "GPT models",
    header: "x-openai-api-key"
  },
  gemini: {
    name: "Gemini",
    description: "Google AI models",
    header: "x-gemini-api-key"
  },
  claude: {
    name: "Claude",
    description: "Anthropic models"
  },
  grok: {
    name: "Grok",
    description: "xAI models"
  }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

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
const settingsMessage = $("#settingsMessage");

// Keys are deliberately not persisted in browser storage.
const providerKeys = {
  openai: "",
  gemini: ""
};

const providerConnected = {
  openai: false,
  gemini: false
};

let isRunning = false;
let isConnecting = false;

function getSelectedProviders() {
  return providerInputs
    .filter(input => input.checked)
    .map(input => input.value.toLowerCase());
}

function updateSelectionUI() {
  const selected = getSelectedProviders();

  selectionCount.textContent =
    `${selected.length} provider${selected.length === 1 ? "" : "s"} selected`;

  selectAllButton.textContent =
    selected.length === providerInputs.length
      ? "Deselect all"
      : "Select all";
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
  const providerId = providerChoice.value;
  const provider = PROVIDERS[providerId];

  if (!provider) return;

  if (providerId === "openai" || providerId === "gemini") {
    providerHelp.textContent =
      `${provider.name} uses your API key through the OGCG AI backend. ` +
      "API usage may incur charges. Your key is kept in page memory.";
    apiKeyInput.placeholder = `Enter your ${provider.name} API key`;
    apiKeyInput.setAttribute("aria-label", `${provider.name} API key`);
    connectProviderButton.textContent = "Connect & Verify";
  } else {
    providerHelp.textContent =
      `${provider.name} (${provider.description}) is not integrated yet. ` +
      "Currently supported: OpenAI and Gemini.";
    apiKeyInput.placeholder = "Provider not available yet";
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

function buildHeaders(providerId, apiKey) {
  return {
    "Content-Type": "application/json",
    [PROVIDERS[providerId].header]: apiKey
  };
}

async function requestProvider(providerId, task) {
  const apiKey = providerKeys[providerId];

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: buildHeaders(providerId, apiKey),
    body: JSON.stringify({
      provider: providerId,
      task
    })
  });

  const data = await readResponse(response);

  if (!response.ok || !data.ok) {
    const error = new Error(
      data.error || `${PROVIDERS[providerId].name} request failed (HTTP ${response.status}).`
    );
    error.status = response.status;
    throw error;
  }

  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error(`${PROVIDERS[providerId].name} returned no text.`);
  }

  return data.text;
}

async function handleConnect() {
  if (isConnecting) return;

  const providerId = providerChoice.value;
  const provider = PROVIDERS[providerId];

  if (!provider) {
    showSettingsMessage("Choose a provider first.", "error");
    return;
  }

  if (!provider.header) {
    showSettingsMessage(
      `${provider.name} is not integrated yet. Choose OpenAI or Gemini.`,
      "error"
    );
    return;
  }

  const enteredKey = apiKeyInput.value.trim();

  if (!enteredKey) {
    showSettingsMessage(`Enter your ${provider.name} API key first.`, "error");
    apiKeyInput.focus();
    return;
  }

  isConnecting = true;
  connectProviderButton.disabled = true;
  connectProviderButton.textContent = "Verifying...";
  showSettingsMessage(`Testing ${provider.name} through your backend...`);

  try {
    const text = await requestWithKey(
      providerId,
      enteredKey,
      "Reply with exactly the word OK."
    );

    if (!text.trim()) {
      throw new Error(`${provider.name} returned no text.`);
    }

    providerKeys[providerId] = enteredKey;
    providerConnected[providerId] = true;
    apiKeyInput.value = "";

    setProviderStatus(providerId, "Connected");
    showSettingsMessage(
      `${provider.name} connected successfully. You can now run tasks.`,
      "success"
    );
  } catch (error) {
    providerKeys[providerId] = "";
    providerConnected[providerId] = false;
    setProviderStatus(providerId, "Not connected");

    showSettingsMessage(error.message, "error");
  } finally {
    isConnecting = false;
    connectProviderButton.disabled = false;
    updateProviderHelp();
  }
}

async function requestWithKey(providerId, apiKey, task) {
  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: buildHeaders(providerId, apiKey),
    body: JSON.stringify({
      provider: providerId,
      task
    })
  });

  const data = await readResponse(response);

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `${PROVIDERS[providerId].name} connection failed (HTTP ${response.status}).`
    );
  }

  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error(`${PROVIDERS[providerId].name} returned no text.`);
  }

  return data.text;
}

function handleSelectAll() {
  const allSelected =
    getSelectedProviders().length === providerInputs.length;

  providerInputs.forEach(input => {
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
    showResults([]);
    return;
  }

  if (!task) {
    showMessage("Enter a coding task first.", "error");
    taskInput.focus();
    showResults([]);
    return;
  }

  isRunning = true;
  runTaskButton.disabled = true;
  runTaskButton.textContent = "Working...";
  showMessage("Running your task with the selected providers...");

  const cards = [];
  let successCount = 0;

  try {
    for (const providerId of selectedProviders) {
      const provider = PROVIDERS[providerId];

      if (!provider) continue;

      if (!provider.header) {
        cards.push(makeResultCard(
          provider.name,
          "Not integrated yet. Currently supported: OpenAI and Gemini."
        ));
        continue;
      }

      if (!providerConnected[providerId] || !providerKeys[providerId]) {
        cards.push(makeResultCard(
          provider.name,
          "Not connected. Open Provider Settings and connect this provider."
        ));
        continue;
      }

      try {
        showMessage(`Waiting for ${provider.name}...`);
        const text = await requestProvider(providerId, task);

        cards.push(makeResultCard(provider.name, "Real AI response", text));
        successCount++;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          providerKeys[providerId] = "";
          providerConnected[providerId] = false;
          setProviderStatus(providerId, "Not connected");
        }

        cards.push(makeResultCard(provider.name, "Request failed", error.message));
      }
    }

    showResults(cards);

    if (successCount === selectedProviders.length) {
      showMessage("All selected providers completed the task.", "success");
    } else if (successCount > 0) {
      showMessage(
        `${successCount} provider${successCount === 1 ? "" : "s"} completed the task. Check the results for other providers.`,
        "success"
      );
    } else {
      showMessage(
        "No selected provider returned a response. Check the result cards and provider settings.",
        "error"
      );
    }
  } finally {
    isRunning = false;
    runTaskButton.disabled = false;
    runTaskButton.textContent = "Run task ↗";
  }
}

function handleNewChat() {
  taskInput.value = "";
  showMessage("");
  showResults([]);
  openChat();
  taskInput.focus();
}

function handleConnectClick(event) {
  event.preventDefault();
  event.stopPropagation();
  openSettings(event.currentTarget.dataset.connect);
}

providerInputs.forEach(input => {
  input.addEventListener("change", () => {
    updateSelectionUI();
    showMessage("");
  });
});

selectAllButton.addEventListener("click", handleSelectAll);
runTaskButton.addEventListener("click", handleRunTask);
connectProviderButton.addEventListener("click", handleConnect);
providerChoice.addEventListener("change", () => {
  apiKeyInput.value = "";
  updateProviderHelp();
  showSettingsMessage("");
});

$$("[data-connect]").forEach(button => {
  button.addEventListener("click", handleConnectClick);
});

settingsNav.addEventListener("click", () => openSettings());
backToChat.addEventListener("click", openChat);
newChatButton.addEventListener("click", handleNewChat);

updateSelectionUI();
updateProviderHelp();

console.info("OGCG AI frontend initialized.");
