import streamlit as st
import streamlit.components.v1 as components
import json
import faiss
import re
import os
import time
import base64
from datetime import datetime, timedelta
from pathlib import Path
from sentence_transformers import SentenceTransformer, CrossEncoder
from dotenv import load_dotenv
import google.generativeai as genai
from graphviz import Digraph
from gtts import gTTS
from PIL import Image 

# --- CUSTOM ENGINE INTEGRATION ---
from scripts.quiz_engine import QuizEngine

# ==================================================
# 1. SETUP & CONFIG
# ==================================================
load_dotenv()
st.set_page_config(
    page_title="AI Study Assistant",
    page_icon="⚡",
    layout="wide" 
)

# --- CSS FOR UI POLISH ---
st.markdown("""
    <style>
    .theory-card {
        background-color: #1e293b;
        padding: 25px;
        border-radius: 15px;
        border: 1px solid #334155;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
    }
    .big-font { font-size: 18px !important; line-height: 1.7 !important; color: #e0e0e0; }
    .big-font strong { color: #60a5fa; } 
    [data-testid="stSidebar"] { font-size: 16px; }
    .flashcard {
        background-color: #1e293b;
        padding: 30px;
        border-radius: 15px;
        border: 1px solid #334155;
        text-align: center;
        font-size: 22px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    </style>
""", unsafe_allow_html=True)

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
INDEX_PATH = MODEL_DIR / "java_faiss.index"
META_PATH = MODEL_DIR / "metadata.json"
FLASHCARD_PATH = BASE_DIR / "flashcards.json"

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    st.error("❌ GEMINI_API_KEY not found.")
    st.stop()

genai.configure(api_key=api_key)
llm = genai.GenerativeModel("gemini-flash-latest")
quiz_engine = QuizEngine(llm)

# ==================================================
# 2. STATE MANAGEMENT
# ==================================================
if "chat_history" not in st.session_state: st.session_state.chat_history = []
if "gen_content" not in st.session_state: st.session_state.gen_content = None
if "gen_type" not in st.session_state: st.session_state.gen_type = None
if "source_map" not in st.session_state: st.session_state.source_map = {}
if "last_ctx" not in st.session_state: st.session_state.last_ctx = []
if "card_idx" not in st.session_state: st.session_state.card_idx = 0
if "review_queue" not in st.session_state: st.session_state.review_queue = []
if "use_hyde" not in st.session_state: st.session_state.use_hyde = False 
if "uploaded_img" not in st.session_state: st.session_state.uploaded_img = None
if "use_rerank" not in st.session_state: st.session_state.use_rerank = True

# ==================================================
# 3. UTILITIES
# ==================================================
@st.cache_resource
def load_assets():
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    cross_encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
    if not INDEX_PATH.exists() or not META_PATH.exists():
        return embedder, cross_encoder, None, []
    index = faiss.read_index(str(INDEX_PATH))
    with open(META_PATH, "r", encoding="utf-8") as f: chunks = json.load(f)
    return embedder, cross_encoder, index, chunks

embedder, cross_encoder, index, chunks = load_assets()

def clean_json_response(text):
    try:
        match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
        if match: return json.loads(match.group(1))
        return json.loads(text)
    except: return None

def text_to_speech(text):
    try:
        text = re.sub(r'```.*?```', 'Code example omitted.', text, flags=re.DOTALL)
        text = re.sub(r'#+\s', '', text)
        tts = gTTS(text=text, lang='en', slow=False)
        filename = "temp_audio.mp3"
        tts.save(filename)
        return filename
    except Exception as e: return None

def custom_audio_player(file_path):
    with open(file_path, "rb") as f:
        data = f.read()
        b64 = base64.b64encode(data).decode()
    audio_html = f"""
    <div style="background-color: #1e293b; padding: 10px; border-radius: 10px; margin-top: 10px;">
        <audio id="audioPlayer" controls style="width: 100%;">
            <source src="data:audio/mp3;base64,{b64}" type="audio/mp3">
        </audio>
    </div>
    """
    st.components.v1.html(audio_html, height=80)

def load_flashcards():
    if FLASHCARD_PATH.exists():
        with open(FLASHCARD_PATH, "r") as f: return json.load(f)
    return []

def save_flashcards(cards):
    with open(FLASHCARD_PATH, "w") as f: json.dump(cards, f, indent=2)

def update_card_mastery(card_question, difficulty):
    cards = load_flashcards()
    for card in cards:
        if card['front'] == card_question:
            if difficulty == "Hard": card['next_review'] = datetime.now().isoformat()
            elif difficulty == "Medium": card['next_review'] = (datetime.now() + timedelta(days=1)).isoformat()
            elif difficulty == "Easy": card['next_review'] = (datetime.now() + timedelta(days=3)).isoformat()
            break
    save_flashcards(cards)

# --- ORGANIC MIND MAP STYLE ---
def build_mind_map_dot(data):
    dot = """
    digraph G {
        rankdir=LR;
        splines=curved;
        bgcolor="transparent";
        nodesep=0.4;
        ranksep=1.0;
        node [shape=rect, style="rounded,filled", fillcolor="white", fontname="Helvetica", penwidth=2, margin=0.2];
        edge [penwidth=1.5, arrowsize=0.7, color="#64748b"];
    """
    topic = data.get("topic", "Topic")
    dot += f'    root [label="{topic}", fillcolor="#475569", fontcolor="white", fontsize=16];\n'
    
    colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]
    
    for i, (branch, details) in enumerate(data.get("branches", {}).items()):
        color = colors[i % len(colors)]
        b_id = f"b{i}"
        dot += f'    {b_id} [label="{branch}", color="{color}", fontcolor="#1e293b"];\n'
        dot += f'    root -> {b_id} [color="{color}"];\n'
        
        if isinstance(details, list):
            for j, item in enumerate(details):
                l_id = f"l{i}_{j}"
                dot += f'    {l_id} [label="{item}", color="{color}", fontcolor="#334155", fontsize=12];\n'
                dot += f'    {b_id} -> {l_id} [color="{color}"];\n'
    dot += "}"
    return dot

def render_dot_chart(dot_code):
    try:
        st.graphviz_chart(dot_code, use_container_width=True)
    except Exception as e:
        st.error(f"Graphviz Error: {e}")

# ==================================================
# 4. GENERATORS
# ==================================================
def retrieve_context(query, top_k=6, use_hyde=False, use_rerank=True):
    if index is None: return "", {}, []
    
    search_query = query
    if use_hyde:
        hyde_prompt = f"Write a short, theoretical paragraph answering this question: {query}"
        hypothetical_doc = llm.generate_content(hyde_prompt).text
        search_query = hypothetical_doc

    fetch_k = top_k * 3 if use_rerank else top_k
    vec = embedder.encode([search_query]).astype("float32")
    _, idxs = index.search(vec, fetch_k)
    
    candidates = []
    for idx in idxs[0]:
        if idx != -1: candidates.append(chunks[idx])
            
    if use_rerank and candidates:
        pairs = [[query, c['text']] for c in candidates]
        scores = cross_encoder.predict(pairs)
        scored_candidates = sorted(list(zip(scores, candidates)), key=lambda x: x[0], reverse=True)
        candidates = [c for score, c in scored_candidates[:top_k]]
    
    labeled_ctx = []
    source_map = {}
    raw_data = []
    for i, c in enumerate(candidates):
        sid = i + 1 
        fname = c.get('metadata', {}).get('source_file', c.get('source', 'Unknown'))
        labeled_ctx.append(f"SOURCE [{sid}]: {c['text']}") 
        source_map[sid] = fname
        raw_data.append({"id": sid, "file": fname, "text": c['text']})
        
    return "\n\n".join(labeled_ctx), source_map, raw_data

def generate_content(query, mode, use_hyde=False, use_rerank=True, image=None):
    ctx, smap, raw = retrieve_context(query, use_hyde=use_hyde, use_rerank=use_rerank)
    
    if mode == "Theory Answer":
        text_prompt = f"""
        Role: Java Professor. Context: {ctx} Question: {query}
        Task: Write a theory answer with headings.
        MANDATORY: Include a Java Code Example (```java ... ```).
        CITATIONS: Use [1], [2] notation.
        """
        inputs = [text_prompt, image] if image else [text_prompt]
        res = llm.generate_content(inputs).text
        return res, smap, raw
        
    elif mode == "Mind Map":
        prompt = f"Generate Mind Map for: {query} Context: {ctx} OUTPUT: STRICT JSON ONLY. Format: {{\"topic\": \"...\", \"branches\": {{\"Branch1\": [\"Leaf1\"]}}}} DO NOT INCLUDE CITATIONS."
        inputs = [prompt, image] if image else [prompt]
        res = clean_json_response(llm.generate_content(inputs).text)
        if not res: res = {"topic": "Error", "branches": {"Parse Error": ["Try again"]}}
        return res, smap, raw
        
    elif mode == "Practice Quiz":
        quiz_data = quiz_engine.generate_quiz(query, ctx)
        return quiz_data, smap, raw
    
    elif mode == "Flashcards":
        prompt = f"Generate 5 Flashcards for: {query} Context: {ctx}. OUTPUT: JSON LIST. Format: [{{\"front\": \"Q?\", \"back\": \"A\"}}]"
        inputs = [prompt, image] if image else [prompt]
        res = clean_json_response(llm.generate_content(inputs).text)
        if not res: res = []
        for card in res: card['box'] = 0; card['next_review'] = datetime.now().isoformat()
        return res, smap, raw

def run_gap_analysis():
    all_files = list(set([c.get('metadata', {}).get('source_file', 'Unit') for c in chunks]))
    prompt = f"Syllabus Files: {all_files}\nIdentify missing topics and suggest a roadmap."
    return llm.generate_content(prompt).text

# ==================================================
# 5. UI LAYOUT
# ==================================================
with st.sidebar:
    st.title("Settings")
    
    uploaded_file = st.file_uploader("📸 Upload Diagram (Visual RAG)", type=["png", "jpg", "jpeg"])
    if uploaded_file:
        st.session_state.uploaded_img = Image.open(uploaded_file)
        st.success("Image Loaded!")
        
        # --- SLIDER ADDED HERE ---
        img_width = st.slider("🖼️ Image Size", 100, 800, 300, 10)
        st.image(st.session_state.uploaded_img, caption="Target", width=img_width)
    else:
        st.session_state.uploaded_img = None

    st.divider()
    st.session_state.use_hyde = st.checkbox("🚀 Enhanced Search (HyDE)", value=False)
    st.session_state.use_rerank = st.checkbox("🥇 Reranking (High Accuracy)", value=True)

    if st.button("🗑️ Clear Chat History"): st.session_state.chat_history = []; st.rerun()
    if st.button("📊 Check Progress"):
        with st.spinner("Analyzing coverage..."):
            roadmap = run_gap_analysis()
            st.session_state.gen_content = roadmap
            st.session_state.gen_type = "Theory Answer"
            st.rerun()

    if st.button("🔄 Review Flashcards"):
        st.session_state.review_queue = load_flashcards()
        st.session_state.gen_type = "Flashcard Review"
        st.session_state.card_idx = 0
        st.rerun()

st.title("⚡ AI Study Assistant")
st.caption("Code + Theory • Mind Maps • Quizzes • Flashcards")

query = st.text_area("Question / Topic:", height=100)
mode = st.radio("Mode:", ["Theory Answer", "Mind Map", "Practice Quiz", "Flashcards"], horizontal=True)
col1, col2 = st.columns(2)
with col1: context_size = st.slider("Context Depth:", 1, 10, 6)
with col2: zoom = st.slider("Zoom Level:", 0.5, 2.0, 1.0)

if st.button("🚀 Generate", use_container_width=True):
    if query:
        with st.spinner("Processing..."):
            content, smap, raw = generate_content(query, mode, use_hyde=st.session_state.use_hyde, use_rerank=st.session_state.use_rerank, image=st.session_state.uploaded_img)
            st.session_state.gen_content = content
            st.session_state.gen_type = mode
            st.session_state.source_map = smap
            st.session_state.last_ctx = raw
            
            if mode == "Flashcards" and isinstance(content, list):
                existing = load_flashcards()
                existing_qs = [c['front'] for c in existing]
                new_cards = [c for c in content if c['front'] not in existing_qs]
                existing.extend(new_cards)
                save_flashcards(existing)
                st.session_state.review_queue = new_cards
                st.session_state.card_idx = 0
            
            st.rerun()

# --- OUTPUT RENDERING ---
if st.session_state.gen_content:
    st.divider()
    
    if st.session_state.gen_type == "Theory Answer":
        st.markdown(f'<div class="theory-card big-font">{st.session_state.gen_content}</div>', unsafe_allow_html=True)
        st.download_button(label="💾 Download Note", data=st.session_state.gen_content, file_name="note.md")
        if st.button("🔊 Listen"):
            audio_file = text_to_speech(st.session_state.gen_content)
            if audio_file: custom_audio_player(audio_file)
        st.divider()
        st.caption("📖 **References:**")
        for k, v in st.session_state.source_map.items(): st.markdown(f"**[{k}]** `{v}`")

    elif st.session_state.gen_type == "Mind Map":
        st.subheader("🗺️ Mind Map")
        dot_code = build_mind_map_dot(st.session_state.gen_content)
        render_dot_chart(dot_code)

    elif st.session_state.gen_type == "Practice Quiz":
        st.subheader("🧠 Quiz")
        for i, q in enumerate(st.session_state.gen_content):
            st.markdown(f"**Q{i+1}: {q['question']}**")
            st.radio("Select:", q['options'], key=f"quiz_{i}_{q['question'][:5]}", index=None)
            with st.expander("Show Answer"):
                st.success(f"Correct: {q.get('correct_answer', q.get('answer'))}")
                st.info(q.get('explanation', ''))

    elif st.session_state.gen_type in ["Flashcards", "Flashcard Review"]:
        queue = st.session_state.get('review_queue', [])
        if not queue:
            st.info("🎉 All caught up!")
        else:
            if st.session_state.card_idx >= len(queue): st.session_state.card_idx = 0
            card = queue[st.session_state.card_idx]
            st.subheader(f"Card {st.session_state.card_idx + 1} of {len(queue)}")
            st.markdown(f"""<div class="flashcard"><h3>{card['front']}</h3></div>""", unsafe_allow_html=True)
            col_prev, col_next = st.columns([1, 1])
            with col_prev:
                if st.button("⬅️ Prev", use_container_width=True):
                    st.session_state.card_idx = max(0, st.session_state.card_idx - 1); st.rerun()
            with col_next:
                if st.button("Next ➡️", use_container_width=True):
                    st.session_state.card_idx = min(len(queue) - 1, st.session_state.card_idx + 1); st.rerun()
            with st.expander("👀 Reveal Answer"):
                st.markdown(f"**Answer:** {card['back']}")
                c1, c2, c3 = st.columns(3)
                if c1.button("Easy 🟢"): update_card_mastery(card['front'], "Easy"); st.session_state.card_idx += 1; st.rerun()
                if c2.button("Medium 🟡"): update_card_mastery(card['front'], "Medium"); st.session_state.card_idx += 1; st.rerun()
                if c3.button("Hard 🔴"): update_card_mastery(card['front'], "Hard"); st.session_state.card_idx += 1; st.rerun()