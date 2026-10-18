
## 1. MediMind AI — LangGraph + Pinecone + FastAPI  - live ( https://medi-mind-ai-v2-oqy3.vercel.app/)



An educational medical assistant with Groq-hosted open-weight LLMs, local open-source embeddings, retrieval from the bundled historical Gale Encyclopedia of Medicine (2002, Volume 1 A–B), optional Tavily fallback, image observations, speech input/output, and a React web UI.

## Requirements
Python 3.11 or 3.12; Pinecone API key; internet connection. Sarvam API key enables multilingual chat, speech synthesis and transcription; Groq API key is used for image observations and provides a chat/transcription fallback. Tavily is optional. Embeddings run locally with `sentence-transformers/all-MiniLM-L6-v2`. This is a tutorial reference implementation, **not** a clinically validated diagnostic system or HIPAA-compliant deployment.

## Start
```bash
conda create -n project python=3.11 -y

conda activate project

python -m pip install -r requirements.txt
```

Create a `.env` file in the project folder with your API keys:
```dotenv
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
TAVILY_API_KEY=your_tavily_api_key
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_CHAT_MODEL=sarvam-105b-conversations
SARVAM_TTS_MODEL=bulbul:v4-flash
SARVAM_STT_MODEL=saaras:v4
```
Tavily is optional. Keep `.env` private and do not commit real keys.

```bash
python ingest.py --pdf data/Medical_book.pdf

cd frontend
npm install
npm run build
cd ..

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
For frontend development, start FastAPI on port 8000 and run `npm run dev` from `frontend`; Vite proxies `/api` requests to FastAPI.

macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate`, then install and run the same commands.

Open **http://127.0.0.1:8000**. API documentation: **http://127.0.0.1:8000/docs**. `/api/health` checks configuration. Run `ingest.py` once before chatting; it downloads the local embedding model on first use and creates a Pinecone serverless index with 384 dimensions. Ingestion does not call a paid embedding API. The default Pinecone index is `medical-agent-groq`; if you configure an existing index with a different dimension, set `PINECONE_INDEX` to a new index name.

## Structure
- `app/config.py` — environment and Conda SSL certificate workaround
- `app/knowledge.py` — local embeddings and Pinecone vector retrieval
- `app/agent.py` — LangGraph retrieval, optional Tavily search and Sarvam/Groq chat
- `app/main.py` — FastAPI, Groq image observations, Sarvam speech synthesis and Sarvam/Groq transcription
- `ingest.py` — chunk and embed every readable PDF page
- `frontend/src/` — React application and styles
- `frontend/` — Vite configuration and build scripts
- `templates/index.html`, `static/style.css`, `static/app.js` — legacy UI files
- `data/Medical_book.pdf` — user-supplied reference PDF

## Troubleshooting
- **Connecting / checking**: run `uvicorn` and open `/api/health` first. Check browser console and backend terminal.
- **401**: if `API_TOKEN` is configured, enter it in the UI's API access section. Do not expose this token in a public browser deployment.
- **502**: inspect backend terminal; verify Groq/Pinecone keys, Pinecone service availability, model availability and connectivity.
- **Camera/microphone**: browser permissions and localhost or HTTPS required.
- **Read answer aloud**: uses Sarvam Bulbul; install/configure a Sarvam API key. Choose MedGuide Asha (female voice) or MedGuide Arjun (male voice), and Auto or English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada or Punjabi. Press Stop audio to interrupt playback. Your voice and assistant-name choice is remembered in this browser. Auto detects the answer script; choose a language manually for Romanized or ambiguous text. Since Bulbul v4 Flash has no female Tamil voice, that selection uses Bulbul v3 for Tamil.
- **Regional language chat and voice input**: add `SARVAM_API_KEY`; the configured Saaras model transcribes microphone audio and the configured Sarvam chat model answers in the user's language. Groq remains necessary for image questions.
- **Past chat history**: completed conversations are saved in the current browser's local storage (not encrypted or synced) and can be reopened or deleted from the Past chats list. Images are not saved there. Deleting a chat also requests removal of its server-side SQLite checkpoints; if the server is offline, the browser copy is still removed and the UI warns that the server copy may remain.
- **Dark/light mode**: use the theme button in the landing page or chat header. Your choice is remembered in this browser.
- **Stop a response**: select Stop while MedGuide is generating. This cancels the browser request; the server may finish processing it in the background.
- **No KB results**: run `python ingest.py` and wait for successful completion; ensure same index and API keys.
- **Tavily**: optional but needed for external fallback. Without its key, external search is disabled.

## Security and production limitations
This project is a functional tutorial scaffold, not a production medical device. Before deploying to real patients: replace shared API token with server-side identity/authentication; add database-backed encrypted conversations and retention/deletion controls; enforce request throttling and upload content verification; implement observability, tests, clinically reviewed emergency triage and evaluation; verify licensing to host/index the Gale PDF; obtain privacy/security/legal review; ensure current authoritative clinical references; and secure the deployment behind HTTPS. Do not send identifiable patient data to third-party APIs without appropriate consent and agreements.

The historical book may contain obsolete clinical advice; model instructions do not guarantee safety. Images can be described but cannot confirm or rule out disease. This software does not make diagnoses.
=======

