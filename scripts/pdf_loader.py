import pdfplumber
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = BASE_DIR / "data" / "raw" / "pdf"
OUTPUT_DIR = BASE_DIR / "data" / "extracted_text"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_text_from_pdf(pdf_path):
    text = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text()
            if page_text:
                text.append(f"\n[PAGE {page_no}]\n{page_text}")
    return "\n".join(text)


def process_pdfs():
    pdf_files = list(INPUT_DIR.rglob("*.pdf"))

    if not pdf_files:
        print("❌ No PDF files found")
        return

    for pdf_file in pdf_files:
        print(f"📘 Processing PDF: {pdf_file.name}")

        header = (
            f"[SOURCE_TYPE: PDF]\n"
            f"[FILE: {pdf_file.name}]\n"
            f"{'-'*40}\n"
        )

        text = extract_text_from_pdf(pdf_file)
        output_file = OUTPUT_DIR / f"{pdf_file.stem}.txt"

        output_file.write_text(header + text, encoding="utf-8")
        print(f"✅ Saved: {output_file}\n")


if __name__ == "__main__":
    process_pdfs()
