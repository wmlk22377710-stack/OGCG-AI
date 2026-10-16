
"use strict";

// OGCG AI — Multi AI Router
// Frontend foundation only. Real AI calls will be added via a secure backend.

const PROVIDERS = {
  openai: {
    name: "OpenAI",
    description: "GPT models"
  },
  gemini: {
    name: "Gemini",
    description: "Google AI models"
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
const connectionInfo = $("#connectionInfo");
const settingsMessage = $("#settingsMessage");

function getSelectedProviders() {
  return providerInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function updateSelectionUI() {
  const selected = getSelectedProviders();
  const count = selected.length;

  selectionCount.textContent =
    `${count} provider${count === 1 ? "" : "s"} selected`;

  selectAllButton.textContent =
    count === providerInputs.length ? "Deselect all" : "Select all";
}

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type ? `message ${type}` : "message";
}

function showSettingsMessage(text, type = "") {
  settingsMessage.textContent = text;
  settingsMessage.className = type
    ? `message ${type}`
    : "message";
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

  if (!provider) {
    providerHelp.textContent = "";
    return;
  }

  providerHelp.textContent =
    `${provider.name}: ${provider.description}. ` +
    "Real connection verification will be enabled after backend setup.";
}

function renderTaskPreview(task, selectedProviders) {
  resultContent.replaceChildren();

  selectedProviders.forEach((providerId) => {
    const provider = PROVIDERS[providerId];
    if (!provider) return;

    const card = document.createElement("article");
    card.className = "result-card";

    const heading = document.createElement("strong");
    heading.textContent = provider.name;

    const status = document.createElement("p");
    status.textContent =
      "Not connected yet — this is a task preview, not an AI response.";

    const taskPreview = document.createElement("p");
    taskPreview.textContent = `Your task: ${task}`;

    card.append(heading, status, taskPreview);
    resultContent.appendChild(card);
  });

  results.hidden = selectedProviders.length === 0;
}

function handleSelectAll() {
  const selected = getSelectedProviders();
  const allSelected = selected.length === providerInputs.length;

  providerInputs.forEach((input) => {
    input.checked = !allSelected;
  });

  updateSelectionUI();
  showMessage("");
}

function handleRunTask() {
  const task = taskInput.value.trim();
  const selectedProviders = getSelectedProviders();

  if (selectedProviders.length === 0) {
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

  showMessage(
    "Task preview created. AI calls are not enabled yet; no provider has been contacted."
  );

  renderTaskPreview(task, selectedProviders);
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

  const provider = event.currentTarget.dataset.connect;
  openSettings(provider);
}

// Provider selection
providerInputs.forEach((input) => {
  input.addEventListener("change", () => {
    updateSelectionUI();
    showMessage("");
  });
});

selectAllButton.addEventListener("click", handleSelectAll);
runTaskButton.addEventListener("click", handleRunTask);

// Prevent the Configure button inside a label from toggling its checkbox.
$$("[data-connect]").forEach((button) => {
  button.addEventListener("click", handleConnectClick);
});

// Navigation
settingsNav.addEventListener("click", () => openSettings());
backToChat.addEventListener("click", openChat);
newChatButton.addEventListener("click", handleNewChat);

// Settings
providerChoice.addEventListener("change", updateProviderHelp);

connectionInfo.addEventListener("click", () => {
  const provider = PROVIDERS[providerChoice.value];

  showSettingsMessage(
    `${provider.name} is not connected yet. Secure backend and API-key verification are the next integration step.`
  );
});

// Initial interface state
updateSelectionUI();
updateProviderHelp();

console.info("OGCG AI frontend initialized successfully.");
    
