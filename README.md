# ⚡ Study.AI — AI-Powered Study Assistant

An intelligent RAG (Retrieval-Augmented Generation) study assistant built with **Streamlit** and **Google Gemini**. Upload your course materials and get AI-powered theory answers, mind maps, quizzes, and flashcards — all grounded in your actual syllabus.

## ✨ Features

| Feature                 | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| 📖 **Theory Answers**   | Get detailed, citation-backed answers from your course material |
| 🗺️ **Mind Maps**        | Auto-generated visual mind maps using Graphviz                  |
| 🧠 **Practice Quizzes** | AI-generated MCQs with explanations                             |
| 🃏 **Flashcards**       | Spaced-repetition flashcards with mastery tracking              |
| 🔊 **Text-to-Speech**   | Listen to answers with built-in TTS                             |
| 📸 **Visual RAG**       | Upload diagrams for image-aware Q&A                             |
| 🚀 **HyDE Search**      | Hypothetical Document Embeddings for better retrieval           |
| 🥇 **Reranking**        | Cross-encoder reranking for high-accuracy results               |

## 🏗️ Architecture

```
study-ai/
├── app.py                    # Main Streamlit application
├── scripts/                  # Processing pipeline
│   ├── pdf_loader.py         # Extract text from PDFs
│   ├── ppt_loader.py         # Extract text from PPTs
│   ├── image_ocr.py          # OCR for images
│   ├── clean_text.py         # Clean extracted text
│   ├── chunker.py            # Chunk text for embeddings
│   ├── build_faiss_index.py  # Build FAISS vector index
│   ├── retrieve.py           # Retrieval engine
│   ├── qa_engine.py          # Q&A engine
│   ├── qa_engine_llm.py      # LLM-based Q&A
│   ├── quiz_engine.py        # Quiz generator
│   └── visual_engine.py      # Visual/diagram engine
├── data/
│   ├── raw/                  # Place your PDFs/PPTs here
│   ├── extracted_text/       # Auto-generated from raw
│   ├── cleaned_text/         # Auto-generated from extracted
│   └── chunks/               # Final chunks (JSON)
├── models/
│   ├── java_faiss.index      # Pre-built FAISS index
│   └── metadata.json         # Chunk metadata
├── requirements.txt
└── .env                      # Your API key (not committed)
```

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Prathmesh1222/study.ai.git
cd study.ai
```

### 2. Set Up Virtual Environment

```bash
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

> **Note:** You also need [Graphviz](https://graphviz.org/download/) installed on your system:
>
> ```bash
> # Ubuntu/Debian
> sudo apt install graphviz
>
> # Mac
> brew install graphviz
>
> # Windows - download from https://graphviz.org/download/
> ```

### 4. Set Up API Key

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 5. Run the App

```bash
streamlit run app.py
```

The app will open at `http://localhost:8501` 🎉

## 📚 Data Setup

### Using Pre-built Index (Ready to Go!)

The repository includes a **pre-built FAISS index** and processed chunks for Java programming topics. You can start using the app immediately after setup — no raw data needed!

### Adding Your Own Materials

To add your own study materials:

1. **Place files** in the `data/raw/` directory:

   ```
   data/raw/
   ├── pdf/         # Put PDFs here (organized by unit/topic)
   └── ppt/         # Put PPTs here
   ```

2. **Run the processing pipeline:**

   ```bash
   # Step 1: Extract text
   python scripts/pdf_loader.py
   python scripts/ppt_loader.py

   # Step 2: Clean text
   python scripts/clean_text.py

   # Step 3: Create chunks
   python scripts/chunker.py

   # Step 4: Build FAISS index
   python scripts/build_faiss_index.py
   ```

3. **Restart the app** and your new material is searchable!

### Downloading Original Raw Data (Optional)

If you want the original Java course PDFs/PPTs used to build this project:

```bash
python setup_data.py
```

> **Note:** This script downloads from cloud storage. See `setup_data.py` for details.

## 🛠️ Tech Stack

- **Frontend:** Streamlit
- **LLM:** Google Gemini (gemini-flash-latest)
- **Embeddings:** sentence-transformers (all-MiniLM-L6-v2)
- **Reranking:** CrossEncoder (ms-marco-MiniLM-L-6-v2)
- **Vector DB:** FAISS
- **Visualization:** Graphviz
- **TTS:** gTTS

## 🤝 Contributing

1. Fork the repo
2. Add your study materials to `data/raw/`
3. Run the pipeline to generate index
4. Submit a PR with your processed data

## 📄 License

This project is open source. Feel free to use and modify for your studies!

---

**Built with ❤️ for students who want to study smarter, not harder.**
