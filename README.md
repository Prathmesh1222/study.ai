# ⚡ Study.AI — AI-Powered Study Assistant

An intelligent RAG (Retrieval-Augmented Generation) study assistant with an **Apple-inspired UI** built with **HTML/CSS/JS** and a **FastAPI** backend. Upload your course materials and get AI-powered theory answers, mind maps, quizzes, and flashcards — all grounded in your actual syllabus.

## ✨ Features

| Feature                      | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| 📖 **Theory Answers**        | Detailed, citation-backed answers from your course material |
| 🧸 **ELI5 Mode**             | Turn complex academic topics into simple, fun analogies     |
| 🗺️ **Interactive Mind Maps** | D3.js visual mind maps with zoom and PNG export             |
| 🧠 **Practice Quizzes**      | AI-generated MCQs with explanations                         |
| 🃏 **Flashcards (SRS)**      | 3D flip animation with SuperMemo-2 mastery tracking         |
| 🔊 **Text-to-Speech**        | Listen to answers with built-in TTS                         |
| 🎤 **Voice Interaction**     | Ask questions naturally using your microphone               |
| 📊 **Gap Analysis**          | Get a personalized learning roadmap based on search history |
| 🌊 **Liquid Theme**          | Premium animated dark/light Apple-inspired design           |
| 🚀 **HyDE Search**           | Hypothetical Document Embeddings for better retrieval       |
| 🥇 **Reranking**             | Cross-encoder reranking for high-accuracy results           |

## 🏗️ Architecture

```
study-ai/
├── server.py                 # FastAPI backend (REST API)
├── static/
│   ├── index.html            # Single-page application
│   ├── css/style.css         # Apple-inspired design system
│   └── js/app.js             # Client-side logic
├── scripts/                  # Processing pipeline
│   ├── pdf_loader.py         # Extract text from PDFs
│   ├── ppt_loader.py         # Extract text from PPTs
│   ├── clean_text.py         # Clean extracted text
│   ├── chunker.py            # Chunk text for embeddings
│   ├── build_faiss_index.py  # Build FAISS vector index
│   ├── quiz_engine.py        # Quiz generator
│   └── visual_engine.py      # Mind map generator
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

### 4. Set Up API Key

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 5. Run the App

```bash
python server.py
```

Open **http://localhost:8000** in your browser 🎉

## 📚 Data Setup

### Using Pre-built Index (Ready to Go!)

The repository includes a **pre-built FAISS index** and processed chunks for Java programming topics. You can start using the app immediately — no raw data needed!

### Adding Your Own Materials

1. **Place files** in `data/raw/pdf/` or `data/raw/ppt/`
2. **Run the pipeline:**
   ```bash
   python scripts/pdf_loader.py
   python scripts/ppt_loader.py
   python scripts/clean_text.py
   python scripts/chunker.py
   python scripts/build_faiss_index.py
   ```
3. **Restart the server** — your new material is searchable!

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS (Glassmorphism), JavaScript
- **Backend:** FastAPI + Uvicorn
- **LLM:** Google Gemini
- **Embeddings:** sentence-transformers (all-MiniLM-L6-v2)
- **Reranking:** CrossEncoder (ms-marco-MiniLM-L-6-v2)
- **Vector DB:** FAISS
- **Visualization:** D3.js (Mind Maps)
- **TTS:** gTTS

## 📄 License

This project is open source. Feel free to use and modify for your studies!

---

**Built with ❤️ for students who want to study smarter, not harder.**
