import json
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
CHUNKS_FILE = BASE_DIR / "data" / "chunks" / "java_chunks.json"
MODEL_DIR = BASE_DIR / "models"

MODEL_DIR.mkdir(parents=True, exist_ok=True)

print("📦 Loading chunks...")
with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
    chunks = json.load(f)

texts = [chunk["text"] for chunk in chunks]

print(f"🔢 Total chunks: {len(texts)}")

# Load embedding model
print("🧠 Loading embedding model...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# Create embeddings
print("⚙️ Creating embeddings...")
embeddings = embedder.encode(texts, show_progress_bar=True)

embeddings = np.array(embeddings).astype("float32")

# Build FAISS index
dimension = embeddings.shape[1]
index = faiss.IndexFlatL2(dimension)
index.add(embeddings)

# Save FAISS index
faiss.write_index(index, str(MODEL_DIR / "java_faiss.index"))

# Save metadata
with open(MODEL_DIR / "metadata.json", "w", encoding="utf-8") as f:
    json.dump(chunks, f, indent=2)

print("✅ STEP 2.1 COMPLETE")
print("📁 Saved:")
print(" - models/java_faiss.index")
print(" - models/metadata.json")
