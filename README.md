# Cyphraxi — AI-Powered Study Engine

An intelligent RAG (Retrieval-Augmented Generation) study engine with a premium **Apple-inspired dark UI**. Upload your course materials and get **streamed** AI-powered theory answers, mind maps, quizzes, and flashcards — all grounded in your actual documents. No hallucinations, just pure data.

## Features

| Feature                  | Description                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| **Axiomatic RAG**        | Streamed token-by-token answers with inline citations from your docs |
| **ELI5 Mode**            | Complex topics explained as simple everyday analogies                |
| **Concept Entanglement** | D3.js hierarchical mind maps with color-coded nodes and zoom         |
| **Practice Quizzes**     | AI-generated MCQs with instant explanations                          |
| **Flashcards (SRS)**     | 3D flip animation with SuperMemo-2 mastery tracking                  |
| **Text-to-Speech**       | Listen to any answer with built-in TTS                               |
| **Voice Input**          | Ask questions using your microphone                                  |
| **Gap Analysis**         | Personalized learning roadmap from your search patterns              |
| **SSE Streaming**        | Token-by-token response rendering with skeleton loader               |
| **Per-Chat Sources**     | Toggle/remove documents per chat from sidebar                        |
| **HyDE + Reranking**     | Advanced retrieval with hypothetical embeddings & cross-encoder      |

## Architecture

```
cyphraxi/
├── server.py                    # FastAPI backend + SSE streaming endpoint
├── setup_data.py                # Automated data pipeline runner
├── static/
│   ├── index.html               # Single-page application
│   ├── css/style.css            # Apple dark mode design system
│   └── js/app.js                # Client logic + SSE stream consumer
├── scripts/
│   ├── pdf_loader.py            # Extract text from PDFs
│   ├── ppt_loader.py            # Extract text from PPTs
│   ├── ocr_loader.py            # OCR for image files (JPG/PNG)
│   ├── clean_text.py            # Clean and normalize text
│   ├── chunker.py               # Chunk text for embeddings
│   ├── build_faiss_index.py     # Build FAISS vector index
│   ├── retrieve.py              # RAG retrieval with HyDE + rerank
│   ├── qa_engine.py             # Query processing engine
│   ├── qa_engine_llm.py         # LLM fallback with key rotation
│   ├── quiz_engine.py           # Quiz generation
│   └── visual_engine.py         # Mind map generation
├── data/                        # Generated at runtime (gitignored)
│   ├── raw/                     # Uploaded PDFs/PPTs/images
│   ├── extracted_text/          # Extracted from raw files
│   ├── cleaned_text/            # Cleaned text output
│   └── chunks/                  # Final chunked JSON
├── models/                      # Generated at runtime (gitignored)
│   ├── study_faiss.index        # FAISS vector index
│   └── metadata.json            # Chunk metadata
├── requirements.txt
└── .env                         # API keys (not committed)
```

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/Prathmesh1222/study.ai.git
cd study.ai
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

### 2. API Key

Create a `.env` file:

```
GEMINI_API_KEY=your_key_here
```

Get a free key from [Google AI Studio](https://aistudio.google.com/apikey). You can add multiple keys comma-separated for automatic fallback.

### 3. Run

```bash
python server.py
```

Open **http://localhost:8000**

### 4. Upload & Study

1. Click **Upload Material** in the sidebar
2. Drop your PDFs, PPTs, or images
3. The pipeline runs automatically (extract -> clean -> chunk -> index)
4. Start asking questions — answers stream in real-time

## Tech Stack

| Layer          | Technology                                     |
| -------------- | ---------------------------------------------- |
| **Frontend**   | HTML, CSS (Apple dark mode), JavaScript, D3.js |
| **Backend**    | FastAPI + Uvicorn, SSE streaming               |
| **LLM**        | Google Gemini (multi-key rotation)             |
| **Embeddings** | sentence-transformers (all-MiniLM-L6-v2)       |
| **Reranking**  | CrossEncoder (ms-marco-MiniLM-L-6-v2)          |
| **Vector DB**  | FAISS                                          |
| **TTS**        | gTTS                                           |
| **OCR**        | pytesseract + Pillow                           |

## How It Works

```
Upload Files → Extract Text → Clean → Chunk → Embed → FAISS Index
                                                          ↓
User Query → HyDE (optional) → Vector Search → Rerank → LLM (Gemini)
                                                          ↓
                                              SSE Stream → Frontend
```

## License

Open source — use and modify freely.

---

**Built by engineers, for engineers.**
