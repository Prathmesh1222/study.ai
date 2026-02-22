from pathlib import Path
import re

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = BASE_DIR / "data" / "extracted_text"
OUTPUT_DIR = BASE_DIR / "data" / "cleaned_text"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def clean_text(text: str) -> str:
    """
    Cleans raw PPT text and makes it exam-friendly
    """
    lines = text.splitlines()
    cleaned_lines = []

    for line in lines:
        line = line.strip()

        # Skip empty lines
        if not line:
            continue

        # Remove slide markers
        if line.startswith("[SLIDE"):
            continue

        # Normalize bullets
        line = re.sub(r"^[•\-–]+", "", line).strip()

        cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def structure_text(text: str) -> str:
    """
    Adds light academic structure
    """
    structured = []
    lines = text.splitlines()

    topic_added = False

    for line in lines:
        # Detect topic heading
        if not topic_added and len(line.split()) <= 6:
            structured.append(f"\nTOPIC: {line}")
            structured.append("\nDefinition:")
            topic_added = True
            continue

        structured.append(line)

    return "\n".join(structured)


def process_all_files():
    files = list(INPUT_DIR.glob("*.txt"))

    if not files:
        print("❌ No extracted text files found")
        return

    for file in files:
        print(f"🧹 Cleaning: {file.name}")

        raw_text = file.read_text(encoding="utf-8")
        cleaned = clean_text(raw_text)
        structured = structure_text(cleaned)

        output_file = OUTPUT_DIR / file.name
        output_file.write_text(structured, encoding="utf-8")

        print(f"✅ Saved cleaned file: {output_file}\n")


if __name__ == "__main__":
    process_all_files()
