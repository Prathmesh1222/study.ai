import json
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"

INDEX_PATH = MODEL_DIR / "java_faiss.index"
META_PATH = MODEL_DIR / "metadata.json"

# Load model & index
embedder = SentenceTransformer("all-MiniLM-L6-v2")
index = faiss.read_index(str(INDEX_PATH))

with open(META_PATH, "r", encoding="utf-8") as f:
    chunks = json.load(f)


def retrieve_context(query, top_k=5):
    query_vec = embedder.encode([query]).astype("float32")
    distances, indices = index.search(query_vec, top_k)

    context = []
    for idx in indices[0]:
        context.append(chunks[idx]["text"])

    return "\n".join(context)


def generate_exam_answer(query, context):
    """
    Rule-based exam-style answer generator
    (LLM can replace this later)
    """
    answer = f"""
Question:
{query}

Answer:

Definition:
{context[:300]}

Explanation:
{context}

Conclusion:
Thus, the concept explained above is an important part of Java programming.
"""
    return answer


if __name__ == "__main__":
    print("📘 AI Study Assistant (Exam Mode)")
    print("Type 'exit' to quit")

    while True:
        query = input("\nAsk a question: ")

        if query.lower() == "exit":
            break

        context = retrieve_context(query)
        answer = generate_exam_answer(query, context)

        print("\n📝 Generated Answer:\n")
        print(answer)
