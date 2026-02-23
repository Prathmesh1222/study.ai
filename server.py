"""
⚡ Study.AI — FastAPI Backend Server
Serves the Apple-inspired web frontend and provides RAG API endpoints.
"""

import json
import re
import os
import base64
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
    """Manages multiple Gemini API keys with automatic fallback."""

    def __init__(self, api_keys, model_name="gemini-1.5-flash"):
        self.api_keys = api_keys
        self.model_name = model_name
        self.current_index = 0
        print(f"✅ LLM Fallback initialized with {len(api_keys)} keys (using {model_name})")

    def _get_key_label(self, idx):
        return f"Key {idx + 1}/{len(self.api_keys)}"

    def generate_content(self, prompt, **kwargs):
        """Try generating with current key, fallback on failure."""
        last_error = None

        for attempt in range(len(self.api_keys)):
            idx = (self.current_index + attempt) % len(self.api_keys)
            key = self.api_keys[idx]

            try:
                # Configure and create model dynamically to ensure the key is applied
                genai.configure(api_key=key)
                model = genai.GenerativeModel(self.model_name)
                
                result = model.generate_content(prompt, **kwargs)

                # Success — remember which key worked
                if idx != self.current_index:
                    print(f"🔄 Switched to {self._get_key_label(idx)} (previous failed)")
                    self.current_index = idx

                return result

            except Exception as e:
                error_msg = str(e)
                last_error = e
                # Check for quota or transient server errors
                is_quota = any(x in error_msg for x in ["429", "quota", "Resource has been exhausted"])
                is_server = any(x in error_msg for x in ["500", "503", "504", "internal server error"])

                if is_quota or is_server:
                    status = "QUOTA" if is_quota else "SERVER ERR"
                    print(f"⚠️  {self._get_key_label(idx)} {status}: {error_msg[:100]}...")
                    if attempt < len(self.api_keys) - 1:
                        continue
                    else:
                        break # All keys exhausted
                else:
                    # Non-quota error (safety, invalid prompt, etc.) — raise immediately
                    print(f"❌ Non-recoverable error on {self._get_key_label(idx)}: {error_msg}")
                    raise

        # All keys exhausted
        msg = f"All {len(self.api_keys)} API keys failed. Last error: {last_error}"
        print(f"🛑 {msg}")
        raise Exception(msg)


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
    difficulty: str  # Easy, Medium, Hard

# ==================================================
# 5. CORE RAG FUNCTIONS
# ==================================================
def retrieve_context(query: str, top_k: int = 6, use_hyde: bool = False, use_rerank: bool = True):
    """Retrieve relevant context from FAISS index."""
    if index is None:
        return "", {}, []

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
        if idx != -1 and idx < len(chunks):
            candidates.append(chunks[idx])

    if use_rerank and candidates:
        pairs = [[query, c["text"]] for c in candidates]
        scores = cross_encoder.predict(pairs)
        scored = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
        candidates = [c for _, c in scored[:top_k]]

    labeled_ctx = []
    source_map = {}
    raw_data = []
    for i, c in enumerate(candidates):
        sid = i + 1
        fname = c.get("metadata", {}).get("source_file", c.get("source", "Unknown"))
        labeled_ctx.append(f"SOURCE [{sid}]: {c['text']}")
        source_map[str(sid)] = fname
        raw_data.append({"id": sid, "file": fname, "text": c["text"]})

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
    """Generate a theory answer with citations."""
    ctx, smap, raw = retrieve_context(
        req.query, top_k=req.top_k,
        use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    prompt = f"""
    Role: Java Professor. Context: {ctx} Question: {req.query}
    Task: Write a detailed theory answer with headings using markdown formatting.
    MANDATORY: Include a Java Code Example (```java ... ```).
    CITATIONS: Use [1], [2] notation referring to source numbers.
    """

    try:
        response = llm.generate_content(prompt).text
        return {
            "answer": response,
            "sources": smap,
            "context": raw
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mindmap")
async def api_mindmap(req: MindMapRequest):
    """Generate a mind map JSON structure."""
    ctx, smap, raw = retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    try:
        data = visual_engine.generate_mind_map(req.query, ctx)
        return {"mindmap": data, "sources": smap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/quiz")
async def api_quiz(req: QuizRequest):
    """Generate quiz MCQs."""
    ctx, smap, raw = retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    try:
        quiz_data = quiz_engine.generate_quiz(req.query, ctx, req.num_questions)
        if not quiz_data:
            raise Exception("Quiz generation returned empty result.")
        return {"questions": quiz_data, "sources": smap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/flashcards/generate")
async def api_generate_flashcards(req: FlashcardRequest):
    """Generate new flashcards and save them."""
    ctx, smap, raw = retrieve_context(
        req.query, use_hyde=req.use_hyde, use_rerank=req.use_rerank
    )

    prompt = f"""Generate 5 Flashcards for: {req.query}
    Context: {ctx}.
    OUTPUT: JSON LIST. Format: [{{"front": "Q?", "back": "A"}}]"""

    try:
        res = clean_json_response(llm.generate_content(prompt).text)
        if not res:
            res = []

        for card in res:
            card["box"] = 0
            card["next_review"] = datetime.now().isoformat()

        # Save to existing flashcards
        existing = load_flashcards()
        existing_qs = [c["front"] for c in existing]
        new_cards = [c for c in res if c["front"] not in existing_qs]
        existing.extend(new_cards)
        save_flashcards(existing)

        return {"flashcards": new_cards, "total": len(existing)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flashcards")
async def api_get_flashcards():
    """Get all saved flashcards."""
    return {"flashcards": load_flashcards()}


@app.put("/api/flashcards/review")
async def api_review_flashcard(review: FlashcardReview):
    """Update flashcard mastery based on review difficulty."""
    cards = load_flashcards()
    for card in cards:
        if card["front"] == review.question:
            if review.difficulty == "Hard":
                card["next_review"] = datetime.now().isoformat()
            elif review.difficulty == "Medium":
                card["next_review"] = (datetime.now() + timedelta(days=1)).isoformat()
            elif review.difficulty == "Easy":
                card["next_review"] = (datetime.now() + timedelta(days=3)).isoformat()
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
async def api_gap_analysis():
    """Run syllabus gap analysis."""
    all_files = list(set([
        c.get("metadata", {}).get("source_file", "Unit")
        for c in chunks
    ]))
    prompt = f"Syllabus Files: {all_files}\nIdentify missing topics and suggest a study roadmap."
    try:
        result = llm.generate_content(prompt).text
        return {"analysis": result}
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
