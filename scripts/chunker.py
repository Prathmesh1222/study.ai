from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = BASE_DIR / "data" / "cleaned_text"
OUTPUT_DIR = BASE_DIR / "data" / "chunks"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 200  # words


def chunk_text(text, chunk_size=CHUNK_SIZE):
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)

    return chunks


def extract_metadata(text, filename):
    unit = "Unknown"
    topic = "Unknown"

    for line in text.splitlines():
        if line.startswith("[UNIT:"):
            unit = line.replace("[UNIT:", "").replace("]", "").strip()
        if line.startswith("TOPIC:"):
            topic = line.replace("TOPIC:", "").strip()
            break

    return unit, topic, filename


def process_files():
    files = list(INPUT_DIR.glob("*.txt"))

    if not files:
        print("❌ No cleaned text files found")
        return

    all_chunks = []

    for file in files:
        print(f"✂️ Chunking: {file.name}")

        text = file.read_text(encoding="utf-8")
        unit, topic, source = extract_metadata(text, file.name)

        chunks = chunk_text(text)

        for idx, chunk in enumerate(chunks):
            chunk_obj = {
                "id": f"{file.stem}_{idx}",
                "text": chunk,
                "metadata": {
                    "unit": unit,
                    "topic": topic,
                    "source_file": source
                }
            }
            all_chunks.append(chunk_obj)

    output_file = OUTPUT_DIR / "java_chunks.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"\n✅ Total chunks created: {len(all_chunks)}")
    print(f"📦 Saved to: {output_file}")


if __name__ == "__main__":
    process_files()
