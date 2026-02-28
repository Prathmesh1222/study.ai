"""
⚡ Study.AI — FastAPI Backend Server
Serves the Apple-inspired web frontend and provides RAG API endpoints.
"""

import json
import re
import os
import base64
import time
import anyio
from datetime import datetime, timedelta
from pathlib import Path

import faiss
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, CrossEncoder
from dotenv import load_dotenv
import google.generativeai as genai
from gtts import gTTS

from scripts.quiz_engine import QuizEngine
from scripts.visual_engine import VisualEngine

# ==================================================
# 1. SETUP & CONFIG
# ==================================================
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
INDEX_PATH = MODEL_DIR / "java_faiss.index"
META_PATH = MODEL_DIR / "metadata.json"
FLASHCARD_PATH = BASE_DIR / "flashcards.json"
STATIC_DIR = BASE_DIR / "static"

# ==================================================
# 1.5 MULTI-API KEY FALLBACK SYSTEM
# ==================================================
def load_api_keys():
    """Load all API keys from .env (GEMINI_API_KEY, GEMINI_API_KEY_2, etc.)"""
    keys = []
    # Primary key
    primary = os.getenv("GEMINI_API_KEY")
    if primary:
        keys.append(primary)
    # Additional keys: GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
    for i in range(2, 11):
        key = os.getenv(f"GEMINI_API_KEY_{i}")
        if key:
            keys.append(key)
    return keys

API_KEYS = load_api_keys()
if not API_KEYS:
    print("❌ No GEMINI_API_KEY found in .env")
    print("   Add at least one key: GEMINI_API_KEY=your_key")
    print("   For fallback, add: GEMINI_API_KEY_2=another_key")
    exit(1)

print(f"🔑 Loaded {len(API_KEYS)} API key(s)")


class LLMFallback:
    """Manages multiple Gemini API keys with automatic fallback using a pre-initialized pool."""

    def __init__(self, api_keys, model_name="gemini-flash-latest"):
        self.api_keys = api_keys
        self.model_name = model_name
        self.current_index = 0
        self.model_pool = []
        
        print(f"🚀 Initializing LLM Pool with {len(api_keys)} keys (using {model_name})...")
        for key in api_keys:
            try:
                # Create a specific configuration for each model instead of global
                m = genai.GenerativeModel(model_name)
                # Note: genai SDK is global-state heavy, we use the key in the call if supported 
                # or rely on the fallback rotation switching the global config only when needed.
                self.model_pool.append({"key": key, "model": m})
            except Exception as e:
                print(f"⚠️  Failed to initialize model for a key: {e}")

    def _get_key_label(self, idx):
        return f"Key {idx + 1}/{len(self.api_keys)}"

    async def generate_content_async(self, prompt, **kwargs):
        """Try generating with pooled models, fallback on failure."""
        last_error = None

        for attempt in range(len(self.api_keys)):
            idx = (self.current_index + attempt) % len(self.api_keys)
            model_info = self.model_pool[idx]

            try:
                # Only re-configure if we are actually switching keys
                genai.configure(api_key=model_info["key"])
                
                # Use the async version of generate_content
                # We offload to thread because the standard genai sync call is blocking
                # and generate_content_async might still have some blocking setup
                response = await anyio.to_thread.run_sync(
                    lambda: model_info["model"].generate_content(prompt, **kwargs)
                )

                if idx != self.current_index:
                    print(f"🔄 Switched to {self._get_key_label(idx)} (previous failed)")
                    self.current_index = idx

                return response

            except Exception as e:
                error_msg = str(e)
                last_error = e
                is_quota = any(x in error_msg.lower() for x in ["429", "quota", "exhausted"])
                is_server = any(x in error_msg for x in ["500", "503", "504"])

                if is_quota or is_server:
                    print(f"⚠️  {self._get_key_label(idx)} failed: {error_msg[:100]}...")
                    continue
                else:
                    raise

        msg = f"All {len(self.api_keys)} API keys failed. Last error: {last_error}"
        print(f"🛑 {msg}")
        raise Exception(msg)

    def generate_content(self, prompt, **kwargs):
        """Sync wrapper for compatibility with legacy engines."""
        # This is for the engines that haven't been updated to async yet
        idx = self.current_index
        model_info = self.model_pool[idx]
        genai.configure(api_key=model_info["key"])
        return model_info["model"].generate_content(prompt, **kwargs)


# Initialize fallback LLM
llm = LLMFallback(API_KEYS)
quiz_engine = QuizEngine(llm)
visual_engine = VisualEngine(llm)

# ==================================================
# 2. LOAD MODELS & DATA
# ==================================================
print("🧠 Loading embedding models...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

index = None
chunks = []

if INDEX_PATH.exists() and META_PATH.exists():
    print("📦 Loading FAISS index...")
    index = faiss.read_index(str(INDEX_PATH))
    with open(META_PATH, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    print(f"✅ Loaded {len(chunks)} chunks")
else:
    print("⚠️  No FAISS index found. RAG features will be limited.")

# ==================================================
# 3. FASTAPI APP
# ==================================================
app = FastAPI(title="Study.AI", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ==================================================
# 4. PYDANTIC MODELS
# ==================================================
class QueryRequest(BaseModel):
    query: str
    use_hyde: bool = False
    use_rerank: bool = True
    top_k: int = 6

class QuizRequest(BaseModel):
    query: str
    num_questions: int = 5
    use_hyde: bool = False
    use_rerank: bool = True

class FlashcardRequest(BaseModel):
    query: str
    use_hyde: bool = False
    use_rerank: bool = True

class MindMapRequest(BaseModel):
    query: str
    use_hyde: bool = False
    use_rerank: bool = True

class TTSRequest(BaseModel):
    text: str

class FlashcardReview(BaseModel):
    question: str
    difficulty: str

class ELI5Request(BaseModel):
    query: str
    use_hyde: bool = False
    use_rerank: bool = True

class GapAnalysisRequest(BaseModel):
    history: list[str]

# ==================================================
# 5. CORE RAG FUNCTIONS
# ==================================================
async def retrieve_context(query: str, top_k: int = 6, use_hyde: bool = False, use_rerank: bool = True):
    """Retrieve relevant context from FAISS index."""
    t0 = time.time()
    if index is None:
        return "", {}, []

    search_query = query
    if use_hyde:
        th = time.time()
        hyde_prompt = f"Write a short, theoretical paragraph answering this question: {query}"
        # Use async generation
        resp = await llm.generate_content_async(hyde_prompt)
        search_query = resp.text
        print(f"⏱️  HyDE took: {time.time() - th:.2f}s")

    t_emb = time.time()
    # Optimization: Reduce search pool for faster reranking on CPU
    fetch_k = top_k * 2 if use_rerank else top_k
    
    # Offload encoding to thread pool
    vec = await anyio.to_thread.run_sync(lambda: embedder.encode([search_query]).astype("float32"))
    _, idxs = index.search(vec, fetch_k)
    print(f"⏱️  Retrieval (Emb + FAISS) took: {time.time() - t_emb:.2f}s")

    candidates = []
    for idx in idxs[0]:
        if idx != -1 and idx < len(chunks):
            candidates.append(chunks[idx])

    if use_rerank and candidates:
        tr = time.time()
        pairs = [[query, c["text"]] for c in candidates]
        # Offload reranking to thread pool
        scores = await anyio.to_thread.run_sync(lambda: cross_encoder.predict(pairs))
        scored = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
        candidates = [c for _, c in scored[:top_k]]
        print(f"⏱️  Reranking took: {time.time() - tr:.2f}s")

    labeled_ctx = []
    source_map = {}
    raw_data = []
    for i, c in enumerate(candidates):
        sid = i + 1
        fname = c.get("metadata", {}).get("source_file", c.get("source", "Unknown"))
        labeled_ctx.append(f"SOURCE [{sid}]: {c['text']}")
        source_map[str(sid)] = fname
        raw_data.append({"id": sid, "file": fname, "text": c["text"]})

    print(f"⏱️  Total Retrieval process: {time.time() - t0:.2f}s")
    return "\n\n".join(labeled_ctx), source_map, raw_data


def clean_json_response(text):
    """Extract JSON from LLM response."""
    try:
        match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return json.loads(text)
    except:
        return None


def load_flashcards():
    if FLASHCARD_PATH.exists():
        with open(FLASHCARD_PATH, "r") as f:
            return json.load(f)
    return []


def save_flashcards(cards):
    with open(FLASHCARD_PATH, "w") as f:
        json.dump(cards, f, indent=2)


# ==================================================
# 6. API ENDPOINTS
# ==================================================
@app.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.post("/api/query")
async def api_query(req: QueryRequest):
    """General RAG query endpoint."""
    t_start = time.time()
    ctx, smap, raw = await retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank, top_k=req.top_k
    )

    prompt = f"""
    Role: Java Professor.
    Context: {ctx}
    Question: {req.query}
    
    Task: Provide a detailed theoretical answer based on the context.
    - Use clear headings.
    - Include at least one relevant Java code example (if applicable).
    - Use citations like [1], [2] based on the sources.
    """
    try:
        t_ai = time.time()
        response = await llm.generate_content_async(prompt)
        print(f"⏱️  AI Generation (Theory) took: {time.time() - t_ai:.2f}s")
        print(f"✨ Total request time: {time.time() - t_start:.2f}s")
        return {"answer": response.text, "sources": smap, "raw_context": raw}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/eli5")
async def api_eli5(req: ELI5Request):
    """Generate an 'Explain Like I'm 5' simplified analogy."""
    ctx, smap, raw = await retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank, top_k=2
    )

    prompt = f"""
    Context: {ctx}
    Topic: {req.query}
    
    Task: Explain this topic to a 5-year-old child using a fun, simple, and relatable everyday analogy. 
    Do not use any technical jargon. Keep it to one or two short paragraphs.
    """
    try:
        response = await llm.generate_content_async(prompt)
        return {"answer": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/mindmap")
async def api_mindmap(req: MindMapRequest):
    """Generate a mind map JSON structure."""
    ctx, smap, raw = await retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    try:
        # Offload engine work to thread
        data = await anyio.to_thread.run_sync(lambda: visual_engine.generate_mind_map(req.query, ctx))
        return {"mindmap": data, "sources": smap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/quiz")
async def api_quiz(req: QuizRequest):
    """Generate quiz MCQs."""
    ctx, smap, raw = await retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    try:
        # Offload engine work to thread
        quiz_data = await anyio.to_thread.run_sync(lambda: quiz_engine.generate_quiz(req.query, ctx, req.num_questions))
        if not quiz_data:
            raise Exception("AI failed to generate quiz. Try again.")
        return {"questions": quiz_data, "sources": smap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/flashcards/generate")
async def api_flashcards_gen(req: FlashcardRequest):
    """Generate new flashcards."""
    ctx, smap, raw = await retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    prompt = f"""
    Topic: {req.query}
    Context: {ctx}
    Task: Generate 5 flashcards for active recall.
    Format: Strict JSON List of objects with "front" and "back" keys.
    """
    try:
        t_ai = time.time()
        res = await llm.generate_content_async(prompt)
        print(f"⏱️  AI Generation (Flashcards) took: {time.time() - t_ai:.2f}s")
        cards = clean_json_response(res.text) or []
        
        # Add SRS metadata
        for c in cards:
            c["repetition"] = 0
            c["interval"] = 1
            c["ease_factor"] = 2.5
            c["next_review"] = datetime.now().isoformat()
            
        return {"flashcards": cards, "sources": smap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flashcards")
async def api_get_flashcards():
    """Get all saved flashcards."""
    return {"flashcards": load_flashcards()}


@app.put("/api/flashcards/review")
async def api_review_flashcard(review: FlashcardReview):
    """Update flashcard mastery using SM-2 algorithm."""
    cards = load_flashcards()
    for card in cards:
        if card["front"] == review.question:
            # SM-2 quality: 0-5 (0 = Hard, 3 = Medium, 5 = Easy)
            q_map = {"Hard": 1, "Medium": 3, "Easy": 5}
            q = q_map.get(review.difficulty, 3)

            # Default attributes if it's an old card
            rep = card.get("repetition", 0)
            interval = card.get("interval", 1)
            ef = card.get("ease_factor", 2.5)

            if q < 3:
                # Failed / Hard - Reset
                rep = 0
                interval = 1
            else:
                # Passed
                if rep == 0:
                    interval = 1
                elif rep == 1:
                    interval = 6
                else:
                    interval = round(interval * ef)
                rep += 1

            # Update ease factor
            ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
            if ef < 1.3:
                ef = 1.3

            card["repetition"] = rep
            card["interval"] = interval
            card["ease_factor"] = ef
            
            # Add interval defined in days
            card["next_review"] = (datetime.now() + timedelta(days=interval)).isoformat()
            break
            
    save_flashcards(cards)
    return {"status": "ok"}


@app.post("/api/tts")
async def api_tts(req: TTSRequest):
    """Generate text-to-speech audio."""
    try:
        text = re.sub(r'```.*?```', 'Code example omitted.', req.text, flags=re.DOTALL)
        text = re.sub(r'#+\s', '', text)
        text = re.sub(r'\*+', '', text)
        text = re.sub(r'\[.*?\]', '', text)

        tts = gTTS(text=text[:5000], lang='en', slow=False)
        filename = str(BASE_DIR / "temp_audio.mp3")
        tts.save(filename)

        with open(filename, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode()

        return {"audio": audio_b64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gap-analysis")
async def api_gap_analysis(req: GapAnalysisRequest):
    """Run syllabus gap analysis based on study history."""
    all_files = list(set([
        c.get("metadata", {}).get("source_file", "Unit")
        for c in chunks
    ]))

    history_text = "\n- ".join(req.history) if req.history else "None yet."

    prompt = f"""
    Syllabus Topics/Files available: {all_files}
    
    Student's recent study history:
    - {history_text}
    
    Task: 
    1. Identify what key topics from the syllabus the student HAS NOT studied yet (the 'Gaps').
    2. Suggest a logical study roadmap for their next 3 sessions based on what they have already covered and what they are missing.
    3. Format the response nicely using Markdown (bullet points, bold text). Keep it encouraging and structured.
    """
    
    try:
        response = await llm.generate_content_async(prompt)
        return {"analysis": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================================================
# 7. RUN SERVER
# ==================================================
if __name__ == "__main__":
    import uvicorn
    print("\n⚡ Study.AI Server starting...")
    print("🌐 Open http://localhost:8000 in your browser\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
