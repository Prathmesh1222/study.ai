"""
📥 Study.AI - Data Setup Script

Downloads the raw study materials (PDFs/PPTs) from cloud storage.
This is OPTIONAL - the app works without raw data since pre-built
FAISS index and chunks are included in the repository.

Usage:
    python setup_data.py

Future: When data grows large, upload to Hugging Face Datasets
and update the DATASET_SOURCE below.
"""

import os
import sys
import shutil
from pathlib import Path

# ============================================================
# CONFIGURATION - Update these when you host your data
# ============================================================

# Option 1: Google Drive (current)
# Share your data/raw folder on Drive and paste the folder link
GDRIVE_FOLDER_URL = ""  # TODO: Add your Google Drive shared link

# Option 2: Hugging Face Datasets (recommended for future)
HF_REPO_ID = ""  # e.g., "Prathmesh1222/study-ai-data"

# ============================================================

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "data" / "raw"


def download_from_gdrive():
    """Download raw data from Google Drive."""
    if not GDRIVE_FOLDER_URL:
        print("❌ Google Drive URL not configured.")
        print("   Edit setup_data.py and set GDRIVE_FOLDER_URL")
        return False

    try:
        import gdown
    except ImportError:
        print("Installing gdown...")
        os.system(f"{sys.executable} -m pip install gdown")
        import gdown

    print(f"📥 Downloading from Google Drive...")
    gdown.download_folder(GDRIVE_FOLDER_URL, output=str(RAW_DIR), quiet=False)
    print("✅ Download complete!")
    return True


def download_from_huggingface():
    """Download raw data from Hugging Face Datasets."""
    if not HF_REPO_ID:
        print("❌ Hugging Face repo not configured.")
        print("   Edit setup_data.py and set HF_REPO_ID")
        return False

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("Installing huggingface_hub...")
        os.system(f"{sys.executable} -m pip install huggingface_hub")
        from huggingface_hub import snapshot_download

    print(f"📥 Downloading from Hugging Face: {HF_REPO_ID}")
    path = snapshot_download(
        repo_id=HF_REPO_ID,
        repo_type="dataset",
        local_dir=str(BASE_DIR / "_hf_download"),
    )

    # Move files to correct location
    src = Path(path) / "raw"
    if src.exists():
        shutil.copytree(src, RAW_DIR, dirs_exist_ok=True)
        shutil.rmtree(BASE_DIR / "_hf_download", ignore_errors=True)

    print("✅ Download complete!")
    return True


def main():
    print("=" * 50)
    print("📚 Study.AI - Data Setup")
    print("=" * 50)

    # Check if raw data already exists
    existing_files = list(RAW_DIR.rglob("*"))
    existing_files = [f for f in existing_files if f.name != ".gitkeep"]
    if existing_files:
        print(f"⚠️  Raw data directory already has {len(existing_files)} files.")
        response = input("   Overwrite? (y/N): ").strip().lower()
        if response != "y":
            print("Skipped.")
            return

    # Try Hugging Face first, then Google Drive
    if HF_REPO_ID:
        success = download_from_huggingface()
    elif GDRIVE_FOLDER_URL:
        success = download_from_gdrive()
    else:
        print()
        print("⚠️  No data source configured yet!")
        print()
        print("The app works WITHOUT raw data — the pre-built FAISS index")
        print("and chunks are already included in the repository.")
        print()
        print("To add raw data source, edit setup_data.py and set either:")
        print("  • GDRIVE_FOLDER_URL  (for Google Drive)")
        print("  • HF_REPO_ID         (for Hugging Face Datasets)")
        print()
        print("Or manually place your PDFs/PPTs in: data/raw/")
        return

    if success:
        print()
        print("🎉 Raw data is ready!")
        print("   Run the processing pipeline to rebuild the index:")
        print("   python scripts/pdf_loader.py")
        print("   python scripts/ppt_loader.py")
        print("   python scripts/clean_text.py")
        print("   python scripts/chunker.py")
        print("   python scripts/build_faiss_index.py")


if __name__ == "__main__":
    main()
