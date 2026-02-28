/**
 * ⚡ Study.AI — Client Application
 * Apple-inspired frontend for the RAG study assistant
 */

// ==================================================
// 1. STATE & CONFIG
// ==================================================
const state = {
  mode: "theory",
  useHyde: false,
  useRerank: true,
  loading: false,
  flashcards: [],
  flashcardIndex: 0,
  flashcardFlipped: false,
  settingsOpen: false,
  history: JSON.parse(localStorage.getItem("study-history") || "[]"),
};

const API = {
  query: "/api/query",
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
};

// ==================================================
// 2. DOM ELEMENTS
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
  fileInput: () => $("#document-upload"),
  uploadBtn: () => $("#upload-btn"),
};

// ==================================================
// 3. MODE SELECTOR
// ==================================================
function initModePills() {
  $$(".mode-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$(".mode-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.mode = pill.dataset.mode;
      
      const input = els.queryInput();
      if (input) {
        if (state.mode === "gap") {
          input.placeholder = "Press Enter to start Gap Analysis...";
          input.value = "";
        } else {
          input.placeholder = "What do you want to learn today?";
        }
      }
    });
  });
}

// ==================================================
// 4. SETTINGS PANEL
// ==================================================
function toggleSettings() {
  state.settingsOpen = !state.settingsOpen;
  els.settingsPanel()?.classList.toggle("open", state.settingsOpen);
  els.settingsOverlay()?.classList.toggle("active", state.settingsOpen);
}

function closeSettings() {
  state.settingsOpen = false;
  els.settingsPanel()?.classList.remove("open");
  els.settingsOverlay()?.classList.remove("active");
}

// ==================================================
// 5. LOADING STATE
// ==================================================
function showLoading(msg = "Thinking...") {
  state.loading = true;
  const overlay = els.loadingOverlay();
  const text = els.loadingText();
  if (overlay) overlay.classList.add("active");
  if (text) text.textContent = msg;
}

function hideLoading() {
  state.loading = false;
  const overlay = els.loadingOverlay();
  if (overlay) overlay.classList.remove("active");
}

// ==================================================
// 6. TOAST NOTIFICATIONS
// ==================================================
function showToast(message, type = "info") {
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const container = els.toastContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ""}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// ==================================================
// 7. API CALLS
// ==================================================
async function apiPost(url, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "API Error");
    }
    return await res.json();
  } catch (e) {
    showToast(e.message, "error");
    throw e;
  }
}

// ==================================================
// 8. VOICE RECOGNITION
// ==================================================
function startVoiceRecognition() {
  const btn = $("#mic-btn");
  if (!("webkitSpeechRecognition" in window)) {
    showToast("Speech recognition not supported in this browser.", "error");
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = function () {
    btn.classList.add("recording");
    els.queryInput().placeholder = "Listening...";
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    els.queryInput().value = transcript;
    
    // Auto-submit after voice input
    setTimeout(() => {
        handleSubmit();
    }, 500);
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error", event.error);
    showToast("Could not recognize speech. Please try again.", "warning");
    btn.classList.remove("recording");
    els.queryInput().placeholder = "What do you want to learn today?";
  };

  recognition.onend = function () {
    btn.classList.remove("recording");
    els.queryInput().placeholder = "What do you want to learn today?";
  };

  recognition.start();
}

// ==================================================
// 9. SUBMIT HANDLER
// ==================================================
async function handleSubmit() {
  const query = els.queryInput()?.value.trim();
  if (!query && state.mode !== "gap") {
    showToast("Please enter a question or topic", "error");
    return;
  }
  if (state.loading) return;

  // Save to history if not in gap mode
  if (query && state.mode !== "gap") {
    if (!state.history.includes(query)) {
      state.history.push(query);
      if (state.history.length > 20) state.history.shift();
      localStorage.setItem("study-history", JSON.stringify(state.history));
    }
  }

  const loadingMessages = {
    theory: "Generating answer...",
    mindmap: "Building mind map...",
    quiz: "Creating quiz...",
    flashcards: "Generating flashcards...",
    gap: "Analyzing your learning trajectory...",
  };

  showLoading(loadingMessages[state.mode] || "Processing...");

  try {
    const basePayload = {
      query,
      use_hyde: state.useHyde,
      use_rerank: state.useRerank,
    };

    let result;
    switch (state.mode) {
      case "theory":
        result = await apiPost(API.query, basePayload);
        renderTheoryAnswer(result);
        break;
      case "mindmap":
        result = await apiPost(API.mindmap, basePayload);
        renderMindMap(result.mindmap);
        break;
      case "quiz":
        result = await apiPost(API.quiz, { ...basePayload, num_questions: 5 });
        renderQuiz(result.questions, result.sources);
        break;
      case "flashcards":
        result = await apiPost(API.flashcardsGenerate, basePayload);
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
// 9. RENDER: THEORY ANSWER
// ==================================================
function renderTheoryAnswer(data) {
  const area = els.resultsArea();
  if (!area) return;

  const sourcesHtml = data.sources
    ? Object.entries(data.sources)
        .map(
          ([id, file]) => `
                <div class="source-item">
                    <span class="badge">${id}</span> ${escapeHtml(file)}
                </div>
            `,
        )
        .join("")
    : "";

  area.innerHTML = `
        <div class="result-card glass-card">
            <div class="card-header">
                <div class="card-title">
                    <span>📖</span> Theory Answer
                </div>
                <div class="card-actions">
                    <button class="btn-icon" onclick="handleELI5()" title="Explain Like I'm 5" id="eli5-btn">
                        🧸
                    </button>
                    <button class="btn-icon" onclick="handleTTS()" title="Listen">
                        🔊
                    </button>
                    <button class="btn-icon" onclick="downloadNote()" title="Download">
                        💾
                    </button>
                </div>
            </div>
            <div class="theory-content" id="theory-content">
                ${renderMarkdown(data.answer)}
            </div>
            <div id="audio-container"></div>
            ${
              sourcesHtml
                ? `
                <div class="sources-section">
                    <h4>References</h4>
                    ${sourcesHtml}
                </div>
            `
                : ""
            }
        </div>
    `;

  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ==================================================
// 10. RENDER: MIND MAP (D3.js Tree)
// ==================================================
function renderMindMap(data) {
  const area = els.resultsArea();
  if (!area) return;

  area.innerHTML = `
        <div class="result-card glass-card animate-in">
            <div class="card-header">
                <div class="card-title">
                    <span>🗺️</span> Mind Map
                </div>
                <div class="card-actions">
                    <button class="btn-icon" onclick="resetMindMapZoom()" title="Reset Zoom">
                        🔄
                    </button>
                    <button class="btn-icon" onclick="exportMindMap()" title="Export PNG">
                        📥
                    </button>
                    <span class="text-xs text-tertiary">Drag to pan • Scroll to zoom</span>
                </div>
            </div>
            <div class="mindmap-container" id="mindmap-svg"></div>
        </div>
    `;

  const container = document.getElementById("mindmap-svg");
  const width = container.clientWidth;
  const height = 500; // Fixed base height for better control

  // Convert flat mind map data to D3 tree structure
  const treeData = {
    name: data.topic || "Topic",
    children: Object.entries(data.branches || {}).map(([branch, leaves]) => ({
      name: branch,
      children: Array.isArray(leaves)
        ? leaves.map((l) => ({ name: l }))
        : [{ name: String(leaves) }],
    })),
  };

  // Create SVG with Zoom support
  const svg = d3
    .select("#mindmap-svg")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("cursor", "move");

  const g = svg.append("g");

  // Zoom logic
  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);
  window.currentZoom = zoom;
  window.currentSvg = svg;

  const treeLayout = d3.tree().size([height - 100, width - 260]);
  const root = d3.hierarchy(treeData);
  treeLayout(root);

  // Apple color palette
  const colors = ["#0071e3", "#34c759", "#ff9f0a", "#ff3b30", "#af52de", "#ff2d55"];

  // 1. Draw links with "grow" animation
  const link = g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const idx = root.children ? root.children.indexOf(d.source) : 0;
      return idx >= 0 ? colors[idx % colors.length] : "#d1d1d6";
    })
    .attr("stroke-width", (d) => (d.source.depth === 0 ? 2.5 : 1.5))
    .attr("stroke-opacity", 0)
    .attr("d", d3.linkHorizontal().x(d => root.y).y(d => root.x)); // Start at root

  link.transition()
    .duration(800)
    .delay(200)
    .attr("stroke-opacity", 0.6)
    .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

  // 2. Nodes group
  const node = g.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", "mindmap-node")
    .attr("transform", d => `translate(${root.y}, ${root.x})`) // Start at root
    .style("opacity", 0);

  node.transition()
    .duration(800)
    .delay((d, i) => 200 + d.depth * 150)
    .attr("transform", d => `translate(${d.y}, ${d.x})`)
    .style("opacity", 1);

  // Root node style
  node.filter((d) => d.depth === 0)
    .append("rect")
    .attr("x", -60).attr("y", -18).attr("width", 120).attr("height", 36).attr("rx", 10)
    .attr("fill", "#1d1d1f");

  node.filter((d) => d.depth === 0)
    .append("text")
    .attr("text-anchor", "middle").attr("dy", 5).attr("fill", "#ffffff")
    .attr("font-size", "13px").attr("font-weight", "600")
    .text(d => truncate(d.data.name, 16));

  // Branch nodes
  node.filter((d) => d.depth === 1)
    .append("rect")
    .attr("x", -50).attr("y", -16).attr("width", 100).attr("height", 32).attr("rx", 8)
    .attr("fill", (d, i) => colors[i % colors.length]).attr("fill-opacity", 0.1)
    .attr("stroke", (d, i) => colors[i % colors.length]).attr("stroke-width", 1.5);

  node.filter((d) => d.depth === 1)
    .append("text")
    .attr("text-anchor", "middle").attr("dy", 5).attr("class", "mindmap-text-primary")
    .attr("font-size", "12px").attr("font-weight", "500")
    .text(d => truncate(d.data.name, 14));

  // Leaf nodes
  node.filter((d) => d.depth > 1)
    .append("circle")
    .attr("r", 4)
    .attr("fill", (d) => {
      const parentIdx = root.children ? root.children.indexOf(d.parent) : 0;
      return colors[parentIdx % colors.length] || "#86868b";
    });

  node.filter((d) => d.depth > 1)
    .append("text")
    .attr("x", 10).attr("dy", 4).attr("class", "mindmap-text-secondary").attr("font-size", "11px")
    .text(d => truncate(d.data.name, 20));

  // Center the view on load
  const initialTransform = d3.zoomIdentity.translate(width / 4, height / 2).scale(0.9);
  svg.call(zoom.transform, initialTransform);

  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetMindMapZoom() {
  if (window.currentZoom && window.currentSvg) {
    const container = document.getElementById("mindmap-svg");
    const width = container.clientWidth;
    const height = 500;
    const initialTransform = d3.zoomIdentity.translate(width / 4, height / 2).scale(0.9);
    window.currentSvg.transition().duration(750).call(window.currentZoom.transform, initialTransform);
  }
}

// ==================================================
// 11. RENDER: QUIZ
// ==================================================
function renderQuiz(questions, sources) {
  const area = els.resultsArea();
  if (!area || !questions || !questions.length) {
    if (area)
      area.innerHTML =
        '<div class="empty-state"><div class="icon">😕</div><h3>Quiz generation failed</h3><p>Try rephrasing your topic.</p></div>';
    return;
  }

  const questionsHtml = questions
    .map((q, i) => {
      const optionsHtml = (q.options || [])
        .map(
          (opt, j) => `
            <label class="quiz-option" data-q="${i}" data-opt="${j}">
                <input type="radio" name="quiz-${i}" value="${j}">
                <span>${escapeHtml(opt)}</span>
            </label>
        `,
        )
        .join("");

      return `
            <div class="quiz-question" id="quiz-q-${i}">
                <h3>Q${i + 1}. ${escapeHtml(q.question)}</h3>
                <div class="quiz-options">${optionsHtml}</div>
                <button class="quiz-check-btn" onclick="checkQuizAnswer(${i}, '${escapeAttr(q.correct_answer || q.answer)}')">
                    Check Answer
                </button>
                <div class="quiz-explanation" id="quiz-exp-${i}">
                    <strong>✓ Correct:</strong> ${escapeHtml(q.correct_answer || q.answer)}<br>
                    <span>${escapeHtml(q.explanation || "")}</span>
                </div>
            </div>
        `;
    })
    .join("");

  area.innerHTML = `
        <div class="result-card glass-card">
            <div class="card-header">
                <div class="card-title">
                    <span>🧠</span> Practice Quiz
                </div>
                <span class="text-sm text-secondary">${questions.length} questions</span>
            </div>
            <div class="quiz-container">${questionsHtml}</div>
        </div>
    `;

  // Attach click listeners to quiz options
  $$(".quiz-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const q = opt.dataset.q;
      $$(`.quiz-option[data-q="${q}"]`).forEach((o) =>
        o.classList.remove("selected"),
      );
      opt.classList.add("selected");
      opt.querySelector("input").checked = true;
    });
  });

  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

function checkQuizAnswer(questionIdx, correctAnswer) {
  const container = $(`#quiz-q-${questionIdx}`);
  if (!container) return;

  const options = container.querySelectorAll(".quiz-option");
  const selected = container.querySelector(".quiz-option.selected");

  options.forEach((opt) => {
    const label = opt.querySelector("span").textContent;
    if (label.trim() === correctAnswer.trim()) {
      opt.classList.add("correct");
    } else if (opt === selected) {
      opt.classList.add("wrong");
    }
  });

  const explanation = $(`#quiz-exp-${questionIdx}`);
  if (explanation) explanation.classList.add("visible");

  container.querySelector(".quiz-check-btn")?.remove();
}

// ==================================================
// 12. RENDER: FLASHCARDS
// ==================================================
function renderFlashcards() {
  const area = els.resultsArea();
  if (!area) return;

  const cards = state.flashcards;
  if (!cards || !cards.length) {
    area.innerHTML =
      '<div class="empty-state"><div class="icon">🎉</div><h3>No flashcards</h3><p>Enter a topic and generate some flashcards!</p></div>';
    return;
  }

  const idx = state.flashcardIndex;
  const card = cards[idx];

  area.innerHTML = `
        <div class="result-card glass-card">
            <div class="card-header">
                <div class="card-title">
                    <span>🃏</span> Flashcards
                </div>
            </div>

            <div class="flashcard-counter">
                Card ${idx + 1} of ${cards.length}
            </div>

            <div class="flashcard-container" onclick="flipFlashcard()">
                <div class="flashcard ${state.flashcardFlipped ? "flipped" : ""}" id="flashcard">
                    <div class="flashcard-face flashcard-front">
                        <h3>${escapeHtml(card.front)}</h3>
                        <div class="hint">Tap to reveal answer</div>
                    </div>
                    <div class="flashcard-face flashcard-back">
                        <p>${escapeHtml(card.back)}</p>
                    </div>
                </div>
            </div>

            <div class="flashcard-nav">
                <button class="btn btn-secondary" onclick="prevFlashcard()" ${idx === 0 ? "disabled" : ""}>
                    ← Previous
                </button>
                <button class="btn btn-secondary" onclick="nextFlashcard()" ${idx >= cards.length - 1 ? "disabled" : ""}>
                    Next →
                </button>
            </div>

            <div class="flashcard-mastery mt-2">
                <button class="mastery-btn easy" onclick="reviewFlashcard('Easy')">Easy 🟢</button>
                <button class="mastery-btn medium" onclick="reviewFlashcard('Medium')">Medium 🟡</button>
                <button class="mastery-btn hard" onclick="reviewFlashcard('Hard')">Hard 🔴</button>
            </div>
        </div>
    `;

  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

function flipFlashcard() {
  state.flashcardFlipped = !state.flashcardFlipped;
  const card = $("#flashcard");
  if (card) card.classList.toggle("flipped", state.flashcardFlipped);
}

function nextFlashcard() {
  if (state.flashcardIndex < state.flashcards.length - 1) {
    state.flashcardIndex++;
    state.flashcardFlipped = false;
    renderFlashcards();
  } else {
    // Finished reviewing
    state.flashcards = [];
    renderFlashcards();
  }
}

function prevFlashcard() {
  if (state.flashcardIndex > 0) {
    state.flashcardIndex--;
    state.flashcardFlipped = false;
    renderFlashcards();
  }
}

async function reviewFlashcard(difficulty) {
  const card = state.flashcards[state.flashcardIndex];
  if (!card) return;

  try {
    await apiPost(API.flashcardsReview, {
      question: card.front,
      difficulty: difficulty,
    });
    showToast(`Marked as ${difficulty}`, "success");
    nextFlashcard();
  } catch (e) {
    console.error(e);
  }
}

// ==================================================
// 13. TTS & DOWNLOAD
// ==================================================
async function handleTTS() {
  const content = $("#theory-content");
  if (!content) return;

  showLoading("Generating audio...");
  try {
    const text = content.innerText;
    const result = await apiPost(API.tts, { text: text.substring(0, 5000) });

    const container = $("#audio-container");
    if (container) {
      container.innerHTML = `
                <div class="audio-player">
                    <span>🔊</span>
                    <audio controls autoplay>
                        <source src="data:audio/mp3;base64,${result.audio}" type="audio/mpeg">
                    </audio>
                </div>
            `;
    }
    showToast("Audio generated!", "success");
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

function downloadNote() {
  const content = $("#theory-content");
  if (!content) return;

  const text = content.innerText;
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "study_note.md";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Note downloaded!", "success");
}

async function exportMindMap() {
  const container = $("#mindmap-svg");
  if (!container || typeof html2canvas === "undefined") {
    showToast("Export failed: Dependencies missing.", "error");
    return;
  }

  showLoading("Exporting mind map...");
  
  // Temporarily reset zoom for a clean export
  resetMindMapZoom();
  
  // Wait a moment for zoom transition to finish
  setTimeout(async () => {
    try {
      const canvas = await html2canvas(container, {
        backgroundColor: document.documentElement.getAttribute("data-theme") === 'dark' ? '#1c1c1e' : '#ffffff',
        scale: 2 // Higher resolution
      });
      
      const link = document.createElement("a");
      link.download = `mindmap_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      
      showToast("Mind map exported!", "success");
    } catch (e) {
      console.error(e);
      showToast("Export failed.", "error");
    } finally {
      hideLoading();
    }
  }, 800);
}

let originalTheoryHtml = "";
let isEli5Active = false;

async function handleELI5() {
  const content = $("#theory-content");
  const query = els.queryInput()?.value.trim();
  
  if (!content || !query) return;

  if (isEli5Active) {
    // Switch back to original theory
    content.style.opacity = 0;
    setTimeout(() => {
      content.innerHTML = originalTheoryHtml;
      content.style.opacity = 1;
      $("#eli5-btn").classList.remove("active");
      isEli5Active = false;
      showToast("Switched to Standard Theory", "info");
    }, 300);
    return;
  }

  // Generate ELI5
  showLoading("Simplifying the concept...");
  try {
    const result = await apiPost(API.eli5, {
        query: query,
        use_hyde: state.useHyde,
        use_rerank: state.useRerank,
    });
    
    // Save original if not saved yet
    if (!originalTheoryHtml) {
        originalTheoryHtml = content.innerHTML;
    }

    content.style.opacity = 0;
    setTimeout(() => {
        content.innerHTML = `
            <div class="eli5-banner" style="background: var(--accent-light); padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: 500;">
                🧸 Explain Like I'm 5 Mode Active
            </div>
            ${renderMarkdown(result.answer)}
        `;
        content.style.opacity = 1;
        content.style.transition = "opacity 0.3s ease";
        $("#eli5-btn").classList.add("active");
        isEli5Active = true;
    }, 300);
    
    showToast("Switched to ELI5 Mode", "success");
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ==================================================
// 14. GAP ANALYSIS
// ==================================================
async function handleGapAnalysis() {
  closeSettings();
  
  // Switch to gap mode
  state.mode = "gap";
  $$(".mode-pill").forEach((p) => p.classList.remove("active"));
  const gapPill = $('[data-mode="gap"]');
  if (gapPill) gapPill.classList.add("active");
  
  els.queryInput().value = "";
  els.queryInput().placeholder = "Press Enter to start Gap Analysis...";
  
// Trigger analysis
  handleSubmit();
}

function renderGapAnalysis(data) {
  const area = els.resultsArea();
  if (!area) return;

  area.innerHTML = `
        <div class="result-card glass-card animate-in">
            <div class="card-header">
                <div class="card-title">
                    <span>📊</span> Gap Analysis & Roadmap
                </div>
            </div>
            <div class="theory-content">
                ${renderMarkdown(data.analysis)}
            </div>
        </div>
    `;

  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ==================================================
// 15. REVIEW EXISTING FLASHCARDS
// ==================================================
async function handleReviewFlashcards() {
  showLoading("Loading flashcards...");
  closeSettings();
  try {
    const res = await fetch(API.flashcardsGet);
    const data = await res.json();
    
    // Filter for due cards
    const now = new Date().toISOString();
    state.flashcards = (data.flashcards || []).filter(c => !c.next_review || c.next_review <= now);
    state.flashcardIndex = 0;
    state.flashcardFlipped = false;

    // Update mode pills
    $$(".mode-pill").forEach((p) => p.classList.remove("active"));
    const fcPill = $('[data-mode="flashcards"]');
    if (fcPill) fcPill.classList.add("active");
    state.mode = "flashcards";

    if (state.flashcards.length === 0) {
      els.resultsArea().innerHTML =
        '<div class="empty-state"><div class="icon">🎉</div><h3>All caught up!</h3><p>You have no flashcards due for review right now.</p></div>';
    } else {
      renderFlashcards();
    }
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ==================================================
// 16. UTILITY FUNCTIONS
// ==================================================
function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    marked.setOptions({
      highlight: function (code, lang) {
        return code;
      },
      breaks: true,
    });
    return marked.parse(text || "");
  }
  // Fallback: basic markdown
  return (text || "")
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.substring(0, max) + "…" : str;
}

// ==================================================
// 17. THEME TOGGLE
// ==================================================
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("study-ai-theme", newTheme);
  showToast(`Switched to ${newTheme} mode`, "info");
}

function initTheme() {
  const savedTheme = localStorage.getItem("study-ai-theme");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

// ==================================================
// 17. UPLOAD & STATUS
// ==================================================
function showUploadOverlay() {
  closeSettings();
  els.uploadOverlay()?.classList.add("active");
  els.uploadStatus().innerHTML = "Ready for your documents.";
}

function hideUploadOverlay() {
  els.uploadOverlay()?.classList.remove("active");
}

async function handleUpload() {
  const files = els.fileInput()?.files;
  if (!files || files.length === 0) {
    showToast("Please select at least one PDF file.", "error");
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    if (!files[i].name.toLowerCase().endsWith(".pdf")) {
       showToast("Only PDF files are currently supported.", "error");
       return;
    }
    formData.append("files", files[i]);
  }

  const btn = els.uploadBtn();
  const statusLine = els.uploadStatus();
  btn.disabled = true;
  btn.innerHTML = "Processing (may take a minute)...";
  statusLine.innerHTML = `Uploading ${files.length} file(s) and building AI index...`;

  try {
    const response = await fetch(API.upload, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (response.ok) {
      showToast("Files processed successfully. Index built!", "success");
      hideUploadOverlay();
      
      const area = els.resultsArea();
      if (area) {
        area.innerHTML = `
            <div class="empty-state">
                <div class="icon">✨</div>
                <h3>Index Built! Ready to learn</h3>
                <p>Enter a question or topic above and select a mode to get started.</p>
            </div>
        `;
      }
    } else {
      showToast(result.detail || "Upload failed.", "error");
      statusLine.innerHTML = `<span style="color:var(--error)">Failed: ${result.detail}</span>`;
    }
  } catch (error) {
    console.error("Upload error:", error);
    showToast("Network error during upload.", "error");
    statusLine.innerHTML = `<span style="color:var(--error)">Network error. Is server running?</span>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Upload & Index files";
    els.fileInput().value = "";
  }
}

async function checkIndexStatus() {
  try {
    const res = await fetch(API.status);
    const data = await res.json();
    if (!data.has_index) {
        showUploadOverlay();
        els.uploadStatus().innerHTML = "No AI index found. Please upload a PDF to begin.";
    }
  } catch (e) {
    console.error("Could not check index status", e);
  }
}

// ==================================================
// 18. INITIALIZATION
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModePills();
  checkIndexStatus();

  // Submit on button click
  els.submitBtn()?.addEventListener("click", handleSubmit);

  // Submit on Cmd/Ctrl+Enter
  els.queryInput()?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  });

  // Settings toggles
  els.hydeToggle()?.addEventListener("change", (e) => {
    state.useHyde = e.target.checked;
  });

  els.rerankToggle()?.addEventListener("change", (e) => {
    state.useRerank = e.target.checked;
  });

  // Show empty state
  const area = els.resultsArea();
  if (area) {
    area.innerHTML = `
            <div class="empty-state">
                <div class="icon">⚡</div>
                <h3>Ready to learn</h3>
                <p>Enter a question or topic above and select a mode to get started.</p>
            </div>
        `;
  }
});
