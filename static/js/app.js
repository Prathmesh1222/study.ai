/**
 * Cyphraxi — Client Application
 * ChatGPT-style layout, per-chat document management
 */

// ==================================================
// 1. STATE & CONFIG
// ==================================================
const state = {
  mode: "theory",
  useHyde: false,
  useRerank: true,
  loading: false,
  uploadFiles: [],
  allowedDocs: null,
  chatHistory: [],
  flashcards: [],
  flashcardIndex: 0,
  flashcardFlipped: false,
  settingsOpen: false,
  sidebarOpen: true,
  history: JSON.parse(localStorage.getItem("study-history") || "[]"),
  chats: [],
  activeChatId: null,
  availableDocs: [],
};

const API = {
  query: "/api/query",
  queryStream: "/api/query/stream",
  eli5: "/api/eli5",
  mindmap: "/api/mindmap",
  quiz: "/api/quiz",
  flashcardsGenerate: "/api/flashcards/generate",
  flashcardsGet: "/api/flashcards",
  flashcardsReview: "/api/flashcards/review",
  tts: "/api/tts",
  gap: "/api/gap-analysis",
  status: "/api/status",
  upload: "/api/upload",
  documents: "/api/documents",
};

// ==================================================
// 2. DOM
// ==================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const els = {
  queryInput: () => $("#query-input"),
  submitBtn: () => $("#submit-btn"),
  resultsArea: () => $("#results-area"),
  loadingOverlay: () => $("#loading-overlay"),
  loadingText: () => $("#loading-text"),
  settingsPanel: () => $("#settings-panel"),
  settingsOverlay: () => $("#settings-overlay"),
  toastContainer: () => $("#toast-container"),
  hydeToggle: () => $("#hyde-toggle"),
  rerankToggle: () => $("#rerank-toggle"),
  uploadOverlay: () => $("#upload-overlay"),
  uploadStatus: () => $("#upload-status"),
  fileUpload: () => $("#file-upload"),
  folderUpload: () => $("#folder-upload"),
  stagedContainer: () => $("#staged-files-container"),
  stagedList: () => $("#staged-files-list"),
  stagedCount: () => $("#staged-count"),
  uploadBtn: () => $("#upload-btn"),
  sourcesList: () => $("#sources-list"),
  chatSidebar: () => $("#chat-sidebar"),
  sidebarChats: () => $("#sidebar-chats"),
  chatTitle: () => $("#chat-title"),
  docBar: () => $("#doc-bar"),
  docChips: () => $("#doc-chips"),
};

// ==================================================
// 3. CHAT SESSION MANAGEMENT
// ==================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function loadChats() {
  try {
    state.chats = JSON.parse(localStorage.getItem("study-chats") || "[]");
    state.activeChatId = localStorage.getItem("study-active-chat") || null;
  } catch (e) { state.chats = []; }

  // Validate active chat exists
  if (state.activeChatId && !state.chats.find(c => c.id === state.activeChatId)) {
    state.activeChatId = null;
  }

  if (state.chats.length === 0) {
    newChat(true);
  } else if (state.activeChatId) {
    switchChat(state.activeChatId, true);
  } else {
    switchChat(state.chats[0].id, true);
  }
  renderSidebar();
}

function saveChats() {
  try {
    localStorage.setItem("study-chats", JSON.stringify(state.chats));
    localStorage.setItem("study-active-chat", state.activeChatId || "");
  } catch (e) { /* quota exceeded */ }
}

function newChat(silent = false) {
  const chat = {
    id: genId(),
    title: "New Chat",
    messages: [],
    documents: [...state.availableDocs],
    allowedDocs: null,
    mode: "theory",
    ts: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  state.chatHistory = [];
  state.allowedDocs = chat.allowedDocs;
  state.mode = "theory";
  
  updateModePills("theory");
  updateChatTitle("Cyphraxi");
  showEmptyState();
  renderDocChips(chat);
  
  if (!silent) {
    saveChats();
    renderSidebar();
  }
}

function switchChat(chatId, silent = false) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;

  // Save current chat before switching
  saveCurrentChat();

  state.activeChatId = chatId;
  state.allowedDocs = chat.allowedDocs ? [...chat.allowedDocs] : null;
  state.mode = chat.mode || "theory";

  // Rebuild chatHistory from stored messages  
  state.chatHistory = chat.messages
    .filter(m => m.type === "theory" && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role, content: m.content }));

  updateModePills(state.mode);
  updateChatTitle(chat.title === "New Chat" ? "Cyphraxi" : chat.title);
  rerenderMessages(chat);
  renderDocChips(chat);

  // Sync settings panel checkboxes too
  syncSourcesPanel();

  if (!silent) {
    saveChats();
    renderSidebar();
  }
}

function deleteChat(chatId, e) {
  if (e) e.stopPropagation();
  state.chats = state.chats.filter(c => c.id !== chatId);
  if (state.activeChatId === chatId) {
    if (state.chats.length === 0) {
      newChat(true);
    } else {
      switchChat(state.chats[0].id, true);
    }
  }
  saveChats();
  renderSidebar();
}

function saveCurrentChat() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  chat.allowedDocs = state.allowedDocs ? [...state.allowedDocs] : null;
  chat.mode = state.mode;
}

function addMessage(role, content, opts = {}) {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;

  const msg = { role, content, type: opts.type || state.mode };
  if (opts.sources) msg.sources = opts.sources;
  chat.messages.push(msg);

  // Auto-title from first user message
  if (role === "user" && chat.title === "New Chat") {
    chat.title = content.length > 50 ? content.substring(0, 50) + "..." : content;
    updateChatTitle(chat.title);
    renderSidebar();
  }
  saveChats();
}

// ==================================================
// 4. SIDEBAR RENDERING
// ==================================================
function renderSidebar() {
  const container = els.sidebarChats();
  if (!container) return;
  
  container.innerHTML = "";
  state.chats.forEach((chat, index) => {
    const div = document.createElement("div");
    div.className = `chat-item${chat.id === state.activeChatId ? " active" : ""}`;
    div.style.animationDelay = `${index * 0.05}s`;
    div.onclick = () => switchChat(chat.id);
    div.innerHTML = `
      <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      <button class="chat-item-delete" onclick="deleteChat('${chat.id}', event)" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    container.appendChild(div);
  });
}

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  els.chatSidebar()?.classList.toggle("collapsed", !state.sidebarOpen);
}

// ==================================================
// 5. PER-CHAT DOCUMENT CHIPS
// ==================================================
function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  if (["ppt","pptx"].includes(ext)) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  if (["jpg","jpeg","png","gif","webp"].includes(ext)) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

function renderDocChips(chat) {
  const bar = els.docBar();
  const chips = els.docChips();
  if (!bar || !chips) return;

  const docs = chat.documents || state.availableDocs || [];
  if (docs.length === 0) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "";
  const allowed = chat.allowedDocs || docs;
  const activeCount = allowed.length;

  // Update the label in sidebar
  const label = bar.querySelector(".sidebar-docs-label");
  if (label) label.innerHTML = `Sources <span class="doc-count">${activeCount}/${docs.length}</span>`;

  chips.innerHTML = "";
  docs.forEach(doc => {
    const isActive = allowed.includes(doc);
    const chip = document.createElement("div");
    chip.className = `doc-chip${isActive ? " active" : ""}`;
    chip.title = `Click to ${isActive ? "disable" : "enable"} — ${doc}`;
    const name = doc.length > 22 ? doc.substring(0, 20) + "..." : doc;
    chip.innerHTML = `
      <span class="doc-chip-dot"></span>
      ${getFileIcon(doc)}
      <span class="doc-chip-name">${escapeHtml(name)}</span>
      <button class="doc-chip-del" title="Remove source" onclick="event.stopPropagation(); removeDocFromChat('${escapeHtml(doc)}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    chip.onclick = () => toggleDocChip(doc);
    chips.appendChild(chip);
  });
}

function removeDocFromChat(doc) {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  chat.documents = (chat.documents || []).filter(d => d !== doc);
  chat.allowedDocs = (chat.allowedDocs || []).filter(d => d !== doc);
  state.allowedDocs = chat.allowedDocs.length > 0 ? [...chat.allowedDocs] : null;
  saveChats();
  renderDocChips(chat);
  syncSourcesPanel();
  showToast(`Removed ${doc}`, "info");
}

function toggleDocChip(doc) {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;

  const docs = chat.documents || state.availableDocs || [];
  let allowed = chat.allowedDocs || [...docs];

  if (allowed.includes(doc)) {
    allowed = allowed.filter(d => d !== doc);
    if (allowed.length === 0) allowed = [...docs]; // can't deselect all
  } else {
    allowed.push(doc);
  }

  chat.allowedDocs = allowed;
  state.allowedDocs = [...allowed];
  
  // Clear chat history when docs change
  state.chatHistory = [];
  
  saveChats();
  renderDocChips(chat);
  syncSourcesPanel();
}

function syncSourcesPanel() {
  const listEl = els.sourcesList();
  if (!listEl) return;
  const checkboxes = listEl.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    cb.checked = !state.allowedDocs || state.allowedDocs.includes(cb.value);
  });
}

// ==================================================
// 6. MESSAGE RENDERING
// ==================================================
function showEmptyState() {
  const area = els.resultsArea();
  if (!area) return;
  area.innerHTML = `
    <div class="empty-state">
      <span class="welcome-pill">Built By Engineers, For Engineers</span>
      <h1 class="welcome-title">Welcome to <span class="gradient-text">Cyphraxi</span></h1>
      <p class="welcome-subtitle">Decode your syllabus. Cyphraxi ingests your raw lectures and transforms them into strictly factual answers, visual mind maps, and dynamic quizzes — no hallucinations, just pure data.</p>
      <div class="intro-grid">
        <div class="intro-feature-card">
          <div class="intro-feature-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h4>Axiomatic RAG</h4>
          <p>Every response is cited directly from your uploaded nodes. Zero guesswork.</p>
        </div>
        <div class="intro-feature-card">
          <div class="intro-feature-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
          </div>
          <h4>Concept Entanglement</h4>
          <p>Automatically generate neural mind maps to visualize system architectures.</p>
        </div>
      </div>
    </div>
  `;
}

function rerenderMessages(chat) {
  const area = els.resultsArea();
  if (!area) return;

  if (!chat.messages || chat.messages.length === 0) {
    showEmptyState();
    return;
  }

  area.innerHTML = "";
  chat.messages.forEach(msg => {
    if (msg.role === "user") {
      renderUserBubble(msg.content);
    } else if (msg.role === "assistant") {
      renderAIMessage(msg.content, msg.sources);
    }
  });
  area.scrollTop = area.scrollHeight;
}

function renderUserBubble(text) {
  const area = els.resultsArea();
  if (!area) return;
  area.insertAdjacentHTML("beforeend", `
    <div class="msg msg-user">
      <div class="msg-user-bubble">${escapeHtml(text)}</div>
    </div>
  `);
}

function renderAIMessage(content, sources) {
  const area = els.resultsArea();
  if (!area) return;

  let sourcesHtml = "";
  if (sources && typeof sources === "object" && Object.keys(sources).length > 0) {
    const refs = Object.entries(sources)
      .map(([id, file]) => `<span class="cite-ref"><span class="cite-num">${id}</span>${escapeHtml(file)}</span>`)
      .join("");
    sourcesHtml = `
      <div class="msg-citations">
        <div class="cite-label">References</div>
        <div class="cite-list">${refs}</div>
      </div>`;
  }

  area.insertAdjacentHTML("beforeend", `
    <div class="msg msg-ai">
      <div class="msg-ai-header">
        <div class="msg-ai-avatar">S</div>
        <span class="msg-ai-name">Cyphraxi</span>
      </div>
      <div class="msg-ai-content">${renderMarkdown(content)}</div>
      ${sourcesHtml}
      <div class="msg-footer">
        <button class="msg-footer-btn" onclick="handleTTS()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          Listen
        </button>
        <button class="msg-footer-btn" onclick="downloadNote()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Save
        </button>
        <button class="msg-footer-btn" onclick="handleELI5()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Simplify
        </button>
      </div>
      <div class="audio-container"></div>
    </div>
  `);
}

// ==================================================
// 7. HELPERS
// ==================================================
function updateModePills(mode) {
  $$(".mode-pill").forEach(p => p.classList.toggle("active", p.dataset.mode === mode));
}

function updateChatTitle(title) {
  const el = els.chatTitle();
  if (el) el.textContent = title;
}

function initModePills() {
  $$(".mode-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      state.mode = pill.dataset.mode;
      updateModePills(state.mode);
      const input = els.queryInput();
      if (input) {
        input.placeholder = state.mode === "gap"
          ? "Press Enter to run Gap Analysis..."
          : "Ask anything about your material...";
        if (state.mode === "gap") input.value = "";
      }
    });
  });
}

// ==================================================
// 8. SETTINGS
// ==================================================
function toggleSettings() {
  state.settingsOpen = !state.settingsOpen;
  els.settingsPanel()?.classList.toggle("active", state.settingsOpen);
  els.settingsOverlay()?.classList.toggle("active", state.settingsOpen);
}

function closeSettings() {
  state.settingsOpen = false;
  els.settingsPanel()?.classList.remove("active");
  els.settingsOverlay()?.classList.remove("active");
}

// ==================================================
// 9. LOADING & TOASTS
// ==================================================
function showLoading(msg = "Thinking...") {
  state.loading = true;
  els.loadingOverlay()?.classList.add("active");
  const t = els.loadingText();
  if (t) t.textContent = msg;
}

function hideLoading() {
  state.loading = false;
  els.loadingOverlay()?.classList.remove("active");
}

function showToast(message, type = "info") {
  const container = els.toastContainer();
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-12px)";
    toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================================================
// 10. API
// ==================================================
async function apiPost(url, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail || `Request failed (${res.status})`;
      showToast(msg, "error");
      throw new Error(msg);
    }
    return await res.json();
  } catch (e) {
    if (!e.message?.includes("Request failed")) {
      showToast("Network error. Is the server running?", "error");
    }
    throw e;
  }
}

// ==================================================
// 11. VOICE
// ==================================================
function startVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Speech not supported in this browser.", "error"); return; }
  const rec = new SR();
  rec.lang = "en-US"; rec.interimResults = false;
  const btn = $("#mic-btn");
  rec.onstart = () => { if (btn) btn.classList.add("listening"); };
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    const input = els.queryInput();
    if (input) { input.value = t; input.focus(); }
  };
  rec.onerror = (e) => showToast(`Voice error: ${e.error}`, "error");
  rec.onend = () => { if (btn) btn.classList.remove("listening"); };
  rec.start();
}

// ==================================================
// 12. SUBMIT
// ==================================================
async function handleSubmit() {
  const query = els.queryInput()?.value.trim();
  if (!query && state.mode !== "gap") {
    showToast("Please enter a question.", "error");
    return;
  }
  if (state.loading) return;

  if (query && state.mode !== "gap") {
    if (!state.history.includes(query)) {
      state.history.push(query);
      if (state.history.length > 20) state.history.shift();
      localStorage.setItem("study-history", JSON.stringify(state.history));
    }
  }

  const msgs = { theory: "Generating answer...", mindmap: "Building mind map...", quiz: "Creating quiz...", flashcards: "Generating flashcards...", gap: "Analyzing..." };
  showLoading(msgs[state.mode] || "Processing...");

  try {
    const base = { query, use_hyde: state.useHyde, use_rerank: state.useRerank, allowed_docs: state.allowedDocs };
    let result;

    switch (state.mode) {
      case "theory": {
        const area = els.resultsArea();
        if (area?.querySelector(".empty-state")) area.innerHTML = "";
        renderUserBubble(query);
        addMessage("user", query);
        els.queryInput().value = "";
        area.scrollTop = area.scrollHeight;

        // Optimistic skeleton loader
        area.insertAdjacentHTML("beforeend", `
          <div class="msg msg-skeleton" id="stream-skeleton">
            <div class="skeleton-glow">
              <div class="skeleton-line"></div>
              <div class="skeleton-line"></div>
              <div class="skeleton-line"></div>
            </div>
          </div>
        `);
        area.scrollTop = area.scrollHeight;
        hideLoading();

        // SSE streaming
        try {
          const payload = { ...base, chat_history: state.chatHistory };
          const res = await fetch(API.queryStream, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          // Remove skeleton
          const skel = document.getElementById("stream-skeleton");
          if (skel) skel.remove();

          // Create AI message container
          area.insertAdjacentHTML("beforeend", `
            <div class="msg msg-ai" id="stream-msg">
              <div class="msg-ai-header">
                <div class="msg-ai-avatar">S</div>
                <span class="msg-ai-name">Cyphraxi</span>
              </div>
              <div class="msg-ai-content" id="stream-content"></div>
            </div>
          `);
          const contentEl = document.getElementById("stream-content");
          let fullText = "";
          let streamSources = null;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            let eventType = "message";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (eventType === "sources") {
                  try { streamSources = JSON.parse(data); } catch(e) {}
                } else if (eventType === "done") {
                  // stream complete
                } else if (eventType === "error") {
                  showToast(data, "error");
                } else {
                  const chunk = data.replace(/\\n/g, "\n");
                  fullText += chunk;
                  if (contentEl) contentEl.innerHTML = renderMarkdown(fullText);
                  area.scrollTop = area.scrollHeight;
                }
                eventType = "message";
              }
            }
          }

          // Finalize: add footer and citations
          const msgEl = document.getElementById("stream-msg");
          if (msgEl) {
            let sourcesHtml = "";
            if (streamSources && Object.keys(streamSources).length > 0) {
              const refs = Object.entries(streamSources)
                .map(([id, file]) => `<span class="cite-ref"><span class="cite-num">${id}</span>${escapeHtml(file)}</span>`)
                .join("");
              sourcesHtml = `<div class="msg-citations"><div class="cite-label">References</div><div class="cite-list">${refs}</div></div>`;
            }
            msgEl.insertAdjacentHTML("beforeend", `
              ${sourcesHtml}
              <div class="msg-footer">
                <button class="msg-footer-btn" onclick="handleTTS()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  Listen
                </button>
                <button class="msg-footer-btn" onclick="downloadNote()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Save
                </button>
                <button class="msg-footer-btn" onclick="handleELI5()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Simplify
                </button>
              </div>
              <div class="audio-container"></div>
            `);
            // Remove temp IDs
            msgEl.removeAttribute("id");
            const sc = document.getElementById("stream-content");
            if (sc) sc.removeAttribute("id");
          }

          state.chatHistory.push({ role: "user", content: query });
          state.chatHistory.push({ role: "assistant", content: fullText });
          addMessage("assistant", fullText, { sources: streamSources });
          area.scrollTop = area.scrollHeight;
        } catch (e) {
          const skel = document.getElementById("stream-skeleton");
          if (skel) skel.remove();
          showToast("Streaming error: " + e.message, "error");
        }
        break;
      }
      case "mindmap":
        result = await apiPost(API.mindmap, base);
        renderMindMap(result.mindmap);
        break;
      case "quiz":
        result = await apiPost(API.quiz, { ...base, num_questions: 5 });
        renderQuiz(result.questions);
        break;
      case "flashcards":
        result = await apiPost(API.flashcardsGenerate, base);
        state.flashcards = result.flashcards;
        state.flashcardIndex = 0;
        state.flashcardFlipped = false;
        renderFlashcards();
        break;
      case "gap":
        result = await apiPost(API.gap, { history: state.history });
        renderGapAnalysis(result);
        break;
    }
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ==================================================
// 13. MIND MAP
// ==================================================

// Convert backend {topic, branches} to D3 {name, children} hierarchy
function convertToHierarchy(data) {
  // Already in {name, children} format
  if (data.name && (data.children || !data.branches)) return data;

  function branchesToChildren(branches) {
    if (!branches || typeof branches !== "object") return [];
    return Object.entries(branches).map(([key, val]) => {
      if (Array.isArray(val)) {
        return { name: key, children: val.map(leaf =>
          typeof leaf === "object" ? convertToHierarchy(leaf) : { name: String(leaf) }
        )};
      } else if (typeof val === "object" && val !== null) {
        return { name: key, children: branchesToChildren(val) };
      }
      return { name: key };
    });
  }

  return {
    name: data.topic || data.name || data.label || "Mind Map",
    children: branchesToChildren(data.branches || data.children || {})
  };
}

function renderMindMap(rawData) {
  const area = els.resultsArea();
  if (!area || !rawData) return;

  const data = convertToHierarchy(rawData);
  const w = Math.min(area.clientWidth - 48, 720);
  const h = 500;

  area.innerHTML = `
    <div class="mindmap-wrap">
      <div class="mindmap-container"><div id="mindmap-svg" style="width:100%;height:${h}px;"></div></div>
      <div class="mindmap-actions" style="margin-top:10px">
        <button class="msg-footer-btn" onclick="resetMindMapZoom()">Reset Zoom</button>
        <button class="msg-footer-btn" onclick="exportMindMap()">Export PNG</button>
      </div>
    </div>
  `;

  const container = document.getElementById("mindmap-svg");
  const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom);

  const root = d3.hierarchy(data);
  const treeLayout = d3.tree().size([h - 60, w - 200]);
  treeLayout(root);

  const t0 = d3.zoomIdentity.translate(100, h / 2 - root.x).scale(0.9);
  svg.call(zoom.transform, t0);
  window.currentZoom = zoom;
  window.currentSvg = svg;

  // Links with curves
  g.selectAll(".link").data(root.links()).enter().append("path").attr("class", "link")
    .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x))
    .style("opacity", 0).transition().duration(600).style("opacity", 1);

  // Nodes
  const node = g.selectAll(".node").data(root.descendants()).enter().append("g").attr("class", "node")
    .attr("transform", d => `translate(${d.y},${d.x})`)
    .style("opacity", 0);

  node.transition().delay((d, i) => i * 40).duration(400).style("opacity", 1);

  node.append("circle")
    .attr("r", d => d.depth === 0 ? 8 : d.children ? 5 : 4)
    .attr("class", d => d.depth === 0 ? "node-root" : d.children ? "node-branch" : "node-leaf");

  node.append("text")
    .attr("dy", "0.31em")
    .attr("x", d => d.children ? -14 : 14)
    .attr("text-anchor", d => d.children ? "end" : "start")
    .text(d => d.data.name || "");
}

function resetMindMapZoom() {
  if (window.currentZoom && window.currentSvg) {
    const c = document.getElementById("mindmap-svg");
    const t = d3.zoomIdentity.translate(c.clientWidth / 4, 240).scale(0.85);
    window.currentSvg.transition().duration(750).call(window.currentZoom.transform, t);
  }
}

// ==================================================
// 14. QUIZ
// ==================================================
function renderQuiz(questions) {
  const area = els.resultsArea();
  if (!area || !questions?.length) {
    if (area) area.innerHTML = '<div class="empty-state"><h2>Quiz generation failed</h2><p>Try a different topic.</p></div>';
    return;
  }

  const html = questions.map((q, i) => {
    const opts = (q.options || []).map((opt, j) => `
      <button class="quiz-option" data-q="${i}" data-opt="${j}" onclick="selectQuizOption(this)">${escapeHtml(opt)}</button>
    `).join("");
    return `
      <div class="quiz-question" id="quiz-q-${i}">
        <h4>Q${i + 1}. ${escapeHtml(q.question)}</h4>
        ${opts}
        <button class="quiz-check-btn" onclick="checkQuizAnswer(${i}, '${escapeAttr(q.correct_answer || q.answer)}')">Check Answer</button>
        <div class="quiz-feedback" id="quiz-exp-${i}" style="display:none">
          <strong>Correct:</strong> ${escapeHtml(q.correct_answer || q.answer)}<br>${escapeHtml(q.explanation || "")}
        </div>
      </div>
    `;
  }).join("");

  area.innerHTML = `<div class="quiz-wrap"><h3 style="margin-bottom:16px">Practice Quiz</h3>${html}</div>`;
}

function selectQuizOption(btn) {
  const q = btn.dataset.q;
  document.querySelectorAll(`.quiz-option[data-q="${q}"]`).forEach(o => o.classList.remove("selected"));
  btn.classList.add("selected");
}

function checkQuizAnswer(idx, correct) {
  const c = $(`#quiz-q-${idx}`);
  if (!c) return;
  c.querySelectorAll(".quiz-option").forEach(o => {
    if (o.textContent.trim() === correct.trim()) o.classList.add("correct");
    else if (o.classList.contains("selected")) o.classList.add("wrong");
    o.disabled = true;
  });
  const exp = $(`#quiz-exp-${idx}`);
  if (exp) exp.style.display = "block";
  c.querySelector(".quiz-check-btn")?.remove();
}

// ==================================================
// 15. FLASHCARDS
// ==================================================
function renderFlashcards() {
  const area = els.resultsArea();
  if (!area) return;
  const cards = state.flashcards;
  if (!cards?.length) {
    area.innerHTML = '<div class="empty-state"><h2>No flashcards</h2><p>Enter a topic to generate flashcards.</p></div>';
    return;
  }
  const i = state.flashcardIndex, card = cards[i];
  area.innerHTML = `
    <div class="flashcard-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3>Flashcards</h3>
        <span style="font-size:13px;color:var(--text-secondary)">Card ${i + 1} of ${cards.length}</span>
      </div>
      <div class="fc-scene" onclick="flipFlashcard()">
        <div class="fc-card ${state.flashcardFlipped ? 'flipped' : ''}" id="flashcard">
          <div class="fc-face fc-front">
            <strong>${escapeHtml(card.front)}</strong>
            <div class="fc-hint">Click to reveal answer</div>
          </div>
          <div class="fc-face fc-back">
            <div class="fc-back-label">Answer</div>
            ${escapeHtml(card.back)}
          </div>
        </div>
      </div>
      <div class="fc-nav">
        <button onclick="prevFlashcard()" ${i === 0 ? "disabled" : ""}>Previous</button>
        <button onclick="nextFlashcard()" ${i >= cards.length - 1 ? "disabled" : ""}>Next</button>
      </div>
      <div class="fc-srs">
        <button onclick="reviewFlashcard('Easy')" style="color:var(--success)">Easy</button>
        <button onclick="reviewFlashcard('Medium')" style="color:var(--warning)">Medium</button>
        <button onclick="reviewFlashcard('Hard')" style="color:var(--error)">Hard</button>
      </div>
    </div>
  `;
}

function flipFlashcard() {
  state.flashcardFlipped = !state.flashcardFlipped;
  const card = $("#flashcard");
  if (card) card.classList.toggle("flipped", state.flashcardFlipped);
}
function nextFlashcard() { if (state.flashcardIndex < state.flashcards.length - 1) { state.flashcardIndex++; state.flashcardFlipped = false; renderFlashcards(); } }
function prevFlashcard() { if (state.flashcardIndex > 0) { state.flashcardIndex--; state.flashcardFlipped = false; renderFlashcards(); } }

async function reviewFlashcard(difficulty) {
  const card = state.flashcards[state.flashcardIndex];
  if (!card) return;
  try {
    await apiPost(API.flashcardsReview, { question: card.front, difficulty });
    showToast(`Marked as ${difficulty}`, "success");
    nextFlashcard();
  } catch (e) { console.error(e); }
}

// ==================================================
// 16. TTS, DOWNLOAD, ELI5
// ==================================================
async function handleTTS() {
  const content = $(".msg-ai-content");
  if (!content) return;
  showLoading("Generating audio...");
  try {
    const result = await apiPost(API.tts, { text: content.innerText.substring(0, 5000) });
    const ac = document.querySelector(".audio-container");
    if (ac) ac.innerHTML = `<audio controls autoplay style="width:100%;margin-top:12px"><source src="data:audio/mp3;base64,${result.audio}" type="audio/mpeg"></audio>`;
    showToast("Audio ready", "success");
  } catch (e) { console.error(e); } finally { hideLoading(); }
}

function downloadNote() {
  const content = $(".msg-ai-content");
  if (!content) return;
  const blob = new Blob([content.innerText], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "study_note.md"; a.click();
  URL.revokeObjectURL(url);
  showToast("Note downloaded", "success");
}

async function exportMindMap() {
  const c = $("#mindmap-svg");
  if (!c || typeof html2canvas === "undefined") { showToast("Export unavailable", "error"); return; }
  showLoading("Exporting...");
  resetMindMapZoom();
  setTimeout(async () => {
    try {
      const canvas = await html2canvas(c, { backgroundColor: document.documentElement.getAttribute("data-theme") === "dark" ? "#000" : "#fff", scale: 2 });
      const link = document.createElement("a");
      link.download = `mindmap_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("Exported", "success");
    } catch (e) { showToast("Export failed", "error"); } finally { hideLoading(); }
  }, 800);
}

let originalTheoryHtml = "";
let isEli5Active = false;

async function handleELI5() {
  const content = $(".msg-ai-content");
  const query = els.queryInput()?.value.trim();
  if (!content) return;
  if (isEli5Active) {
    content.innerHTML = originalTheoryHtml;
    isEli5Active = false;
    return;
  }
  if (!query) { showToast("Enter a query first", "error"); return; }
  showLoading("Simplifying...");
  try {
    const result = await apiPost(API.eli5, { query, use_hyde: state.useHyde, use_rerank: state.useRerank });
    originalTheoryHtml = content.innerHTML;
    content.innerHTML = `<div style="background:var(--accent-subtle);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:13px;font-weight:500;color:var(--accent)">Simplified explanation</div>${renderMarkdown(result.answer)}`;
    isEli5Active = true;
  } catch (e) { console.error(e); } finally { hideLoading(); }
}

// ==================================================
// 17. GAP ANALYSIS
// ==================================================
async function handleGapAnalysis() {
  closeSettings();
  state.mode = "gap";
  updateModePills("gap");
  els.queryInput().value = "";
  handleSubmit();
}

function renderGapAnalysis(data) {
  const area = els.resultsArea();
  if (!area) return;
  area.innerHTML = `<div class="gap-wrap"><div class="msg-ai-content">${renderMarkdown(data.analysis)}</div></div>`;
}

async function handleReviewFlashcards() {
  showLoading("Loading flashcards...");
  closeSettings();
  try {
    const res = await fetch(API.flashcardsGet);
    const data = await res.json();
    const now = new Date().toISOString();
    state.flashcards = (data.flashcards || []).filter(c => !c.next_review || c.next_review <= now);
    state.flashcardIndex = 0;
    state.flashcardFlipped = false;
    state.mode = "flashcards";
    updateModePills("flashcards");
    state.flashcards.length === 0
      ? (els.resultsArea().innerHTML = '<div class="empty-state"><h2>All caught up</h2><p>No flashcards due for review.</p></div>')
      : renderFlashcards();
  } catch (e) { console.error(e); } finally { hideLoading(); }
}

// ==================================================
// 18. UTILITIES
// ==================================================
function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    marked.setOptions({ breaks: true });
    return marked.parse(text || "");
  }
  return (text || "").replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text || "";
  return d.innerHTML;
}

function escapeAttr(text) {
  return (text || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ==================================================
// 19. THEME
// ==================================================
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("study-ai-theme", next);
}

function initTheme() {
  const saved = localStorage.getItem("study-ai-theme");
  document.documentElement.setAttribute("data-theme", saved || "dark");
}

// ==================================================
// 20. UPLOAD & STATUS
// ==================================================
async function loadDocumentSources() {
  try {
    const res = await fetch(API.documents);
    const data = await res.json();
    state.availableDocs = data.documents || [];

    const listEl = els.sourcesList();
    if (!listEl) return;

    if (state.availableDocs.length === 0) {
      listEl.innerHTML = '<span class="sources-empty">No documents loaded.</span>';
      return;
    }

    listEl.innerHTML = "";
    state.availableDocs.forEach(doc => {
      const label = document.createElement("label");
      label.className = "toggle-row";
      label.innerHTML = `<input type="checkbox" value="${doc}" checked><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${doc}">${doc}</span>`;
      label.querySelector("input").addEventListener("change", () => {
        updateAllowedDocsFromPanel();
      });
      listEl.appendChild(label);
    });

    // Update current chat's documents
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat) {
      chat.documents = [...state.availableDocs];
      renderDocChips(chat);
      saveChats();
    }
  } catch (e) { console.warn("Failed to load docs", e); }
}

function updateAllowedDocsFromPanel() {
  const listEl = els.sourcesList();
  if (!listEl) return;
  const checked = Array.from(listEl.querySelectorAll("input:checked")).map(cb => cb.value);
  state.allowedDocs = checked.length > 0 ? checked : null;
  
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (chat) {
    chat.allowedDocs = state.allowedDocs ? [...state.allowedDocs] : null;
    renderDocChips(chat);
    saveChats();
  }
}

function showUploadOverlay() {
  closeSettings();
  els.uploadOverlay()?.classList.add("active");
  const s = els.uploadStatus();
  if (s) s.innerHTML = "";
  state.uploadFiles = [];
  renderStagedFiles();
}

function hideUploadOverlay() {
  els.uploadOverlay()?.classList.remove("active");
  state.uploadFiles = [];
}

const SUPPORTED_EXTS = [".pdf", ".ppt", ".pptx", ".jpg", ".jpeg", ".png"];

function handleFileSelection(e) {
  const files = e.target.files;
  if (!files) return;
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!SUPPORTED_EXTS.some(ext => name.endsWith(ext))) continue;
    if (!state.uploadFiles.some(f => f.name === file.name && f.size === file.size)) {
      state.uploadFiles.push(file);
    }
  }
  e.target.value = "";
  renderStagedFiles();
}

function removeStagedFile(i) { state.uploadFiles.splice(i, 1); renderStagedFiles(); }

function renderStagedFiles() {
  const container = els.stagedContainer(), list = els.stagedList(), count = els.stagedCount(), btn = els.uploadBtn();
  if (!container || !list || !count || !btn) return;
  count.innerText = state.uploadFiles.length;
  if (state.uploadFiles.length === 0) { container.style.display = "none"; btn.disabled = true; return; }
  container.style.display = "block";
  btn.disabled = false;
  list.innerHTML = "";
  state.uploadFiles.forEach((file, i) => {
    const mb = (file.size / 1048576).toFixed(2);
    const li = document.createElement("li");
    li.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%">${file.name} <span style="color:var(--text-tertiary);font-size:11px">(${mb} MB)</span></span><button onclick="removeStagedFile(${i})">&times;</button>`;
    list.appendChild(li);
  });
}

async function handleUpload() {
  if (state.uploadFiles.length === 0) { showToast("Select files first.", "error"); return; }
  const formData = new FormData();
  state.uploadFiles.forEach(f => formData.append("files", f));
  const btn = els.uploadBtn(), status = els.uploadStatus();
  btn.disabled = true;
  btn.textContent = "Processing...";
  if (status) status.textContent = `Uploading ${state.uploadFiles.length} file(s)...`;

  try {
    const res = await fetch(API.upload, { method: "POST", body: formData });
    const result = await res.json();
    if (res.ok) {
      showToast("Index built successfully", "success");
      hideUploadOverlay();
      state.chatHistory = [];
      showEmptyState();
      await loadDocumentSources();
    } else {
      showToast(result.detail || "Upload failed.", "error");
      if (status) status.innerHTML = `<span style="color:var(--error)">${result.detail}</span>`;
    }
  } catch (e) {
    console.error(e);
    showToast("Network error during upload.", "error");
    if (status) status.innerHTML = '<span style="color:var(--error)">Network error</span>';
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload & Build Index";
  }
}

async function checkIndexStatus() {
  try {
    const res = await fetch(API.status);
    const data = await res.json();
    if (!data.has_index) {
      showUploadOverlay();
      const s = els.uploadStatus();
      if (s) s.textContent = "No index found. Upload material to begin.";
    } else {
      await loadDocumentSources();
    }
  } catch (e) { console.warn("Status check failed", e); }
}

// ==================================================
// 21. INIT
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModePills();
  loadChats();
  checkIndexStatus();

  els.submitBtn()?.addEventListener("click", handleSubmit);

  const input = els.queryInput();
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    });
    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 150) + "px";
    });
  }

  els.hydeToggle()?.addEventListener("change", e => { state.useHyde = e.target.checked; });
  els.rerankToggle()?.addEventListener("change", e => { state.useRerank = e.target.checked; });

  // Drag & drop on upload zone
  const dropZone = document.getElementById("upload-drop-zone");
  if (dropZone) {
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.style.borderColor = "var(--accent)"; });
    dropZone.addEventListener("dragleave", () => { dropZone.style.borderColor = ""; });
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.style.borderColor = "";
      handleFileSelection({ target: { files: e.dataTransfer.files, value: "" } });
    });
  }
});
