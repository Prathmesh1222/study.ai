from pathlib import Path
from PIL import Image
import pytesseract

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = BASE_DIR / "data" / "raw" / "images"
OUTPUT_DIR = BASE_DIR / "data" / "extracted_text"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png"]


def extract_text_from_image(image_path):
    """
    Extract text from an image using OCR
    """
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img)
    return text


def process_images():
    image_files = [
        f for f in INPUT_DIR.rglob("*")
        if f.suffix.lower() in SUPPORTED_EXTENSIONS
    ]

    if not image_files:
        print("❌ No image files found")
        return

    for img_file in image_files:
        unit_name = img_file.parent.name  # auto-detect folder
        safe_name = img_file.stem.replace(" ", "_")

        print(f"🖼️ Processing image: {img_file.name}")

        header = (
            f"[UNIT: {unit_name}]\n"
            f"[SOURCE_TYPE: IMAGE]\n"
            f"[FILE: {img_file.name}]\n"
            f"{'-'*40}\n"
        )

        try:
            text = extract_text_from_image(img_file)

            output_file = OUTPUT_DIR / f"{unit_name}_{safe_name}.txt"
            output_file.write_text(header + text, encoding="utf-8")

            print(f"✅ Saved: {output_file}\n")

        except Exception as e:
            print(f"⚠️ Failed OCR for {img_file.name}: {e}")


if __name__ == "__main__":
    process_images()
