import os 
import certifi 
from dotenv import load_dotenv

# --- AUTOMATIC SSL FIX FOR CONDA/PYTHON ENVIRONMENTS ---
ssl_cert = os.environ.get('SSL_CERT_FILE')
if ssl_cert and not os.path.exists(ssl_cert):
    os.environ['SSL_CERT_FILE'] = certifi.where()
elif not ssl_cert:
    os.environ['SSL_CERT_FILE'] = certifi.where()
# --------------------------------------------------------

load_dotenv()
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str = ''
    pinecone_api_key: str = ''
    tavily_api_key: str = ''
    pinecone_index: str = 'medical-agent-groq'
    groq_chat_model: str = 'openai/gpt-oss-120b'
    groq_vision_model: str = 'qwen/qwen3.6-27b'
    groq_transcription_model: str = 'whisper-large-v3-turbo'
    sarvam_api_key: str = ''
    sarvam_chat_model: str = 'sarvam-105b-conversations'
    sarvam_tts_model: str = 'bulbul:v4-flash'
    sarvam_stt_model: str = 'saaras:v4'
    api_token: str = ''
    allowed_origins: str = 'http://localhost:8000,http://127.0.0.1:8000'
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')



settings = Settings()
