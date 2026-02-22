import json
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import os
from openai import OpenAI

load_dotenv()

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"

INDEX_PATH = MODEL_DIR / "java_faiss.index"
META_PATH = MODEL_DIR / "metadata.json"

# Load models
embedder = SentenceTransformer("all-MiniLM-L6-v2")
index = faiss.read_index(str(INDEX_PATH))

with open(META_PATH, "r", encoding="utf-8") as f:
    chunks = json.load(f)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def retrieve_context(query, top_k=5):
    query_vec = embedder.encode([query]).astype("float32")
    _, indices = index.search(query_vec, top_k)

    context = []
    for idx in indices[0]:
        context.append(chunks[idx]["text"])

    return "\n".join(context)


def generate_answer(query, context):
    response = client.responses.create(
    model="gpt-4o-mini",
    input=f"""
You are a university exam assistant.

Use ONLY the context below to answer.

Context:
{context}

Question:
{query}

Instructions:
- Write exam-oriented answer
- Use headings
- Suitable for 10-mark question
"""
)

    return response.output_text



if __name__ == "__main__":
    print("📘 AI Study Assistant (LLM Mode)")
    print("Type 'exit' to quit")

    while True:
        query = input("\nAsk a question: ")

        if query.lower() == "exit":
            break

        context = retrieve_context(query)
        answer = generate_answer(query, context)

        print("\n📝 Answer:\n")
        print(answer)
