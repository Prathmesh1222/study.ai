import json
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"

INDEX_PATH = MODEL_DIR / "java_faiss.index"
META_PATH = MODEL_DIR / "metadata.json"

# Load embedding model
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# Load FAISS index
index = faiss.read_index(str(INDEX_PATH))

# Load metadata
with open(META_PATH, "r", encoding="utf-8") as f:
    metadata = json.load(f)


def retrieve(query, top_k=5):
    """
    Retrieve top-k relevant chunks for a query
    """
    query_embedding = embedder.encode([query])
    query_embedding = np.array(query_embedding).astype("float32")

    distances, indices = index.search(query_embedding, top_k)

    results = []
    for idx in indices[0]:
        results.append(metadata[idx])

    return results


if __name__ == "__main__":
    while True:
        query = input("\nAsk a Java question (or type 'exit'): ")

        if query.lower() == "exit":
            break

        results = retrieve(query)

        print("\n🔍 Retrieved Context:\n")
        for i, r in enumerate(results, start=1):
            print(f"--- Result {i} ---")
            print(f"Unit: {r['metadata']['unit']}")
            print(f"Topic: {r['metadata']['topic']}")
            print(r['text'][:500], "\n")

