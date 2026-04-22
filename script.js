const API_URL = "https://loreal-chatbot.aryankn29.workers.dev";
const SELECTED_PRODUCTS_KEY = "loreal-selected-products-v1";
const RTL_KEY = "loreal-rtl-enabled-v1";
const MAX_CONVERSATION_MESSAGES = 18;

const SYSTEM_PROMPT = `You are L'Oreal Routine Builder, a beauty advisor focused on skincare, haircare, makeup, and fragrance.

Rules:
- Use the provided selected products as your primary grounding.
- For routine requests, prioritize selected products first and avoid inventing product details.
- Follow-up chats can cover beauty topics related to routine order, compatibility, and usage.
- Politely refuse unrelated topics outside beauty/routines.
- Avoid medical certainty; include gentle safety notes where relevant.
- Distinguish clearly between routine-based advice and general beauty guidance.
- Use web/current-information mode only when freshness matters (new launches, trends, price/news changes, ingredient updates).
- If current information is used, include visible source URLs.
- Keep responses concise, practical, and structured with clear headings or bullet points.`;

const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedBtn = document.getElementById("clearSelectedBtn");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const rtlToggle = document.getElementById("rtlToggle");

const descriptionModal = document.getElementById("descriptionModal");
const closeDescriptionModalBtn = document.getElementById("closeDescriptionModal");
const modalProductBrand = document.getElementById("modalProductBrand");
const modalProductName = document.getElementById("modalProductName");
const modalProductDescription = document.getElementById("modalProductDescription");

let allProducts = [];
let selectedProductIds = new Set();
let conversationHistory = [];
let routineGenerated = false;
let isBusy = false;

function initializeChatPlaceholder() {
  chatWindow.innerHTML = `
    <div class="chat-message assistant">
      <div class="chat-bubble">
        Select products and click <strong>Generate Routine</strong> to start. After that, you can ask follow-up beauty questions here.
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadProducts() {
  const response = await fetch("products.json");
  if (!response.ok) {
    throw new Error("Could not load product catalog.");
  }
  const data = await response.json();
  return data.products || [];
}

function filterProducts() {
  const selectedCategory = categoryFilter.value.trim().toLowerCase();
  const keyword = productSearch.value.trim().toLowerCase();

  return allProducts.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const searchable = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const matchesKeyword = !keyword || searchable.includes(keyword);
    return matchesCategory && matchesKeyword;
  });
}

function renderProducts() {
  const filteredProducts = filterProducts();

  if (!filteredProducts.length) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match this category/search combo yet.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = filteredProducts
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      return `
      <article class="product-card ${isSelected ? "is-selected" : ""}" data-product-id="${product.id}">
        <button class="card-select-btn" type="button" aria-label="${isSelected ? "Unselect" : "Select"} ${escapeHtml(product.name)}">
          <span class="select-label">${isSelected ? "Selected" : "Select"}</span>
        </button>
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <div class="product-info">
          <p class="product-brand">${escapeHtml(product.brand)}</p>
          <h3>${escapeHtml(product.name)}</h3>
          <p class="product-category">${escapeHtml(product.category)}</p>
          <button type="button" class="link-btn description-btn" data-product-id="${product.id}">
            View description
          </button>
        </div>
      </article>`;
    })
    .join("");
}

function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

function saveSelectedProducts() {
  localStorage.setItem(SELECTED_PRODUCTS_KEY, JSON.stringify([...selectedProductIds]));
}

function hydrateSelectedProducts() {
  const raw = localStorage.getItem(SELECTED_PRODUCTS_KEY);
  if (!raw) return;
  try {
    const ids = JSON.parse(raw);
    if (Array.isArray(ids)) {
      selectedProductIds = new Set(ids);
    }
  } catch (_error) {
    selectedProductIds = new Set();
  }
}

function renderSelectedProducts() {
  const selected = getSelectedProducts();

  if (!selected.length) {
    selectedProductsList.innerHTML = `<p class="selected-empty">No products selected yet.</p>`;
    clearSelectedBtn.disabled = true;
    return;
  }

  clearSelectedBtn.disabled = false;
  selectedProductsList.innerHTML = selected
    .map(
      (product) => `
      <div class="selected-pill" data-product-id="${product.id}">
        <span>${escapeHtml(product.brand)} - ${escapeHtml(product.name)}</span>
        <button type="button" class="remove-selected-btn" data-product-id="${product.id}" aria-label="Remove ${escapeHtml(product.name)}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`
    )
    .join("");
}

function toggleSelectedProduct(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }
  saveSelectedProducts();
  renderProducts();
  renderSelectedProducts();
}

function clearSelectedProducts() {
  selectedProductIds.clear();
  saveSelectedProducts();
  renderProducts();
  renderSelectedProducts();
}

function openDescriptionModal(productId) {
  const product = allProducts.find((item) => item.id === productId);
  if (!product) return;
  modalProductBrand.textContent = product.brand;
  modalProductName.textContent = product.name;
  modalProductDescription.textContent = product.description;
  descriptionModal.showModal();
}

function closeDescriptionModal() {
  if (descriptionModal.open) {
    descriptionModal.close();
  }
}

function appendChatMessage(role, content, sources = []) {
  const sourceHtml = sources.length
    ? `
    <div class="sources-block">
      <p>Sources:</p>
      <ul>
        ${sources
          .map(
            (source) =>
              `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.url)}</a></li>`
          )
          .join("")}
      </ul>
    </div>`
    : "";

  const html = `
    <div class="chat-message ${role}">
      <div class="chat-bubble">${content.replaceAll("\n", "<br>")}</div>
      ${sourceHtml}
    </div>
  `;
  chatWindow.insertAdjacentHTML("beforeend", html);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setBusyState(nextBusy) {
  isBusy = nextBusy;
  generateRoutineBtn.disabled = nextBusy;
  sendBtn.disabled = nextBusy;
  userInput.disabled = nextBusy;
}

function detectFreshnessNeed(text) {
  const freshnessKeywords = [
    "latest",
    "new",
    "recent",
    "launch",
    "trend",
    "this year",
    "current",
    "news",
    "updated",
    "price"
  ];
  const normalized = text.toLowerCase();
  return freshnessKeywords.some((keyword) => normalized.includes(keyword));
}

function buildMessagesPayload(userMessage, includeRoutineGenerationContext = false) {
  const selectedProducts = getSelectedProducts().map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description
  }));

  const contextMessage = {
    role: "system",
    content: `Selected products JSON:\n${JSON.stringify(selectedProducts, null, 2)}`
  };

  const routineInstruction = includeRoutineGenerationContext
    ? [
        {
          role: "user",
          content:
            "Build a personalized routine using only the selected products first. Use clear step order (AM/PM when relevant), short reasons, and practical cautions."
        }
      ]
    : [];

  return [
    { role: "system", content: SYSTEM_PROMPT },
    contextMessage,
    ...routineInstruction,
    ...conversationHistory,
    { role: "user", content: userMessage }
  ];
}

async function callWorker({ messages, useWebSearch }) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      project: "p9",
      messages,
      useWebSearch
    })
  });

  if (!response.ok) {
    throw new Error("Worker request failed.");
  }

  const data = await response.json();
  if (!data.reply) {
    throw new Error("Invalid Worker response format.");
  }
  return data;
}

function addToConversation(role, content) {
  conversationHistory.push({ role, content });
  if (conversationHistory.length > MAX_CONVERSATION_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_MESSAGES);
  }
}

async function requestAssistantReply(userMessage, includeRoutineGenerationContext = false) {
  const useWebSearch = detectFreshnessNeed(userMessage);
  const payloadMessages = buildMessagesPayload(userMessage, includeRoutineGenerationContext);
  const result = await callWorker({
    messages: payloadMessages,
    useWebSearch
  });

  addToConversation("user", userMessage);
  addToConversation("assistant", result.reply);

  appendChatMessage("assistant", escapeHtml(result.reply), result.sources || []);
}

async function handleGenerateRoutine() {
  const selected = getSelectedProducts();
  if (!selected.length) {
    appendChatMessage(
      "assistant",
      "Please select at least one product before generating your routine."
    );
    return;
  }

  setBusyState(true);
  appendChatMessage("assistant", "Crafting your personalized routine...");
  try {
    conversationHistory = [];
    const userMessage = "Generate my personalized routine based on my selected products.";
    await requestAssistantReply(userMessage, true);
    routineGenerated = true;
  } catch (_error) {
    appendChatMessage(
      "assistant",
      "I could not generate the routine right now. Please try again in a moment."
    );
  } finally {
    setBusyState(false);
  }
}

async function handleFollowUpChat(messageText) {
  if (!routineGenerated) {
    appendChatMessage(
      "assistant",
      "Generate a routine first, then I can help with follow-up questions."
    );
    return;
  }

  appendChatMessage("user", escapeHtml(messageText));
  setBusyState(true);
  try {
    await requestAssistantReply(messageText, false);
  } catch (_error) {
    appendChatMessage(
      "assistant",
      "I hit a temporary issue answering that. Please try again."
    );
  } finally {
    setBusyState(false);
  }
}

function applyDirectionPreference() {
  const isRtl = localStorage.getItem(RTL_KEY) === "true";
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  rtlToggle.setAttribute("aria-pressed", String(isRtl));
  rtlToggle.textContent = isRtl ? "LTR Mode" : "RTL Mode";
}

function bindEvents() {
  categoryFilter.addEventListener("change", renderProducts);
  productSearch.addEventListener("input", renderProducts);

  productsContainer.addEventListener("click", (event) => {
    const card = event.target.closest(".product-card");
    const descriptionButton = event.target.closest(".description-btn");
    if (!card && !descriptionButton) return;

    if (descriptionButton) {
      const productId = Number(descriptionButton.dataset.productId);
      openDescriptionModal(productId);
      return;
    }

    const productId = Number(card.dataset.productId);
    toggleSelectedProduct(productId);
  });

  selectedProductsList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-selected-btn");
    if (!removeButton) return;
    const productId = Number(removeButton.dataset.productId);
    if (selectedProductIds.has(productId)) {
      selectedProductIds.delete(productId);
      saveSelectedProducts();
      renderProducts();
      renderSelectedProducts();
    }
  });

  clearSelectedBtn.addEventListener("click", clearSelectedProducts);
  generateRoutineBtn.addEventListener("click", handleGenerateRoutine);

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = userInput.value.trim();
    if (!message || isBusy) return;
    userInput.value = "";
    await handleFollowUpChat(message);
  });

  rtlToggle.addEventListener("click", () => {
    const nextRtl = document.documentElement.dir !== "rtl";
    localStorage.setItem(RTL_KEY, String(nextRtl));
    applyDirectionPreference();
  });

  closeDescriptionModalBtn.addEventListener("click", closeDescriptionModal);
  descriptionModal.addEventListener("click", (event) => {
    const modalContent = event.target.closest(".description-modal-content");
    if (!modalContent) {
      closeDescriptionModal();
    }
  });
}

async function init() {
  initializeChatPlaceholder();
  applyDirectionPreference();
  bindEvents();

  try {
    allProducts = await loadProducts();
    hydrateSelectedProducts();
    renderProducts();
    renderSelectedProducts();
  } catch (_error) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Product catalog is unavailable right now. Please refresh and try again.
      </div>
    `;
    selectedProductsList.innerHTML = `<p class="selected-empty">Unable to load selections.</p>`;
  }
}

init();
