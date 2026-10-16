import base64
import secrets
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from groq import Groq
import httpx
from uuid import UUID, uuid4
from app.config import settings
from app.agent import graph

ROOT=Path(__file__).resolve().parent.parent
app=FastAPI(title='Medical Agent Educational API',version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=settings.allowed_origins.split(','),allow_credentials=False,allow_methods=['GET','POST','DELETE'],allow_headers=['Authorization','Content-Type'])
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')
FRONTEND_DIST = ROOT / 'frontend' / 'dist'
app.mount('/frontend',StaticFiles(directory=FRONTEND_DIST,check_dir=False),name='frontend')


class ChatRequest(BaseModel):
    message: str = Field(min_length=1,max_length=4000)
    history: list[dict[str,str]] = Field(default_factory=list,max_length=10)
    image_data: str | None = None

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    language_code: str
    voice_gender: Literal['female', 'male'] = 'female'


TTS_SPEAKERS = {
    'en-IN': {'female': 'ritu_en_medical', 'male': 'shubh_en_narration'},
    'hi-IN': {'female': 'ritu_hi_medical', 'male': 'rahul_hi_conversational'},
    'bn-IN': {'female': 'roopa_bn_conversational', 'male': 'arnab_bn_conversation'},
    'gu-IN': {'female': 'pooja_gu_conversational', 'male': 'bhavik_gu_conversation'},
    'kn-IN': {'female': 'chaitra_kn_conversation', 'male': 'chetan_kn_conversation'},
    'mr-IN': {'female': 'ishita_mr_conversational', 'male': 'nilesh_mr_conversation'},
    'pa-IN': {'female': 'harpreet_pa_narration', 'male': 'anand_pa_conversation'},
    'ta-IN': {'female': 'ishita', 'male': 'gokul_ta_narration'},
    'te-IN': {'female': 'kavitha_te_conversation', 'male': 'tarun_te_narration'},
}

def auth(authorization: str | None):
    if settings.api_token and not secrets.compare_digest(authorization or '',f'Bearer {settings.api_token}'):
        raise HTTPException(status_code=401,detail='Invalid API token')


def inspect_image(data):
    if not data:
        return ''
    try:
        header,payload=data.split(',',1)
        mime=header.split(';')[0].split(':')[1]
        raw=base64.b64decode(payload,validate=True)
        if mime not in ('image/jpeg','image/png','image/webp') or len(raw)>5_000_000:
            raise ValueError('Only JPEG/PNG/WebP under 5MB supported')
    except (ValueError,IndexError) as exc:
        raise HTTPException(status_code=400,detail=f'Invalid image: {exc}')
    client=Groq(api_key=settings.groq_api_key,timeout=45)
    result=client.chat.completions.create(model=settings.groq_vision_model,messages=[{'role':'user','content':[{'type':'text','text':'Describe only objectively visible medical-relevant features. Do not diagnose, estimate severity, or assert absence of illness. If image unclear, say so.'},{'type':'image_url','image_url':{'url':data}}]}],max_tokens=300)
    return result.choices[0].message.content or ''


@app.get('/',response_class=HTMLResponse)
def home():
    index = FRONTEND_DIST / 'index.html'
    if not index.is_file():
        return HTMLResponse(
            '<!doctype html><html lang="en"><meta charset="utf-8"><title>MedGuide AI</title>'
            '<p>The React UI has not been built yet. Run <code>npm install</code> and '
            '<code>npm run build</code> in the <code>frontend</code> directory.</p></html>',
            status_code=503,
        )
    return FileResponse(index)

@app.get('/api/health')
def health():
    return {
        'status': 'ok',
        'configured': bool((settings.groq_api_key or settings.sarvam_api_key) and settings.pinecone_api_key),
        'sarvam': bool(settings.sarvam_api_key),
        'tavily': bool(settings.tavily_api_key),
    }



@app.post('/api/chat')
def chat(
    payload: ChatRequest,
    authorization: str | None = Header(default=None),
    conversation_id: str | None = Header(default=None, alias='X-Conversation-ID')
):
    auth(authorization)

    if not (settings.groq_api_key or settings.sarvam_api_key) or not settings.pinecone_api_key:
        raise HTTPException(503,'Set SARVAM_API_KEY or GROQ_API_KEY and PINECONE_API_KEY in .env')
    if payload.image_data and not settings.groq_api_key:
        raise HTTPException(503,'Set GROQ_API_KEY in .env to enable image questions.')

    history=[x for x in payload.history if x.get('role') in ('user','assistant') and isinstance(x.get('content'),str)][:10]

    # SQLite persistent memory: reuse the same conversation thread
    thread_id = conversation_id or str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    try:
        observation=inspect_image(payload.image_data)

        state=graph.invoke(
            {
                'question':payload.message,
                'history':history,
                'image_description':observation,
                'kb':[],
                'web':[],
                'answer':'',
                'route':''
            },
            config=config
        )

        return {
            'answer':state['answer'],
            'sources': [{'type':'pdf','page':x['page'],'score':x['score']} for x in state['kb']]+[{'type':'web','url':x['url'],'title':x['title']} for x in state['web']],
            'tools': ['pinecone']+(['tavily'] if state['route']=='web' and settings.tavily_api_key else [])+(['vision'] if observation else []),
            'conversation_id':thread_id
        }

    except HTTPException:
        raise
    except Exception as exc:
        print('Chat error:',repr(exc),flush=True)
        raise HTTPException(502,'AI service failed. Check server logs, credentials, Pinecone index, and connectivity.')


@app.delete('/api/conversations/{conversation_id}')
def delete_conversation(conversation_id: UUID, authorization: str | None = Header(default=None)):
    auth(authorization)
    graph.checkpointer.delete_thread(str(conversation_id))
    return {'deleted': True}


@app.post('/api/transcribe')
async def transcribe(file:UploadFile=File(...),authorization:str|None=Header(default=None)):
    auth(authorization)
    data=await file.read(10_000_001)
    if len(data)>10_000_000:
        raise HTTPException(413,'Audio exceeds 10 MB')
    if settings.sarvam_api_key:
        try:
            response = httpx.post(
                'https://api.sarvam.ai/speech-to-text',
                headers={'api-subscription-key': settings.sarvam_api_key},
                data={'model': settings.sarvam_stt_model, 'mode': 'transcribe'},
                files={'file': (file.filename or 'voice.webm', data, file.content_type or 'audio/webm')},
                timeout=60,
            )
            response.raise_for_status()
            transcript = response.json().get('transcript')
            if not isinstance(transcript, str):
                raise HTTPException(502, 'Speech transcription returned an invalid response.')
            return {'text': transcript}
        except httpx.HTTPError as exc:
            print('Sarvam transcription error:',repr(exc),flush=True)
            raise HTTPException(502,'Regional speech transcription unavailable. Check Sarvam API access and try again.')

    if not settings.groq_api_key:
        raise HTTPException(503,'Set SARVAM_API_KEY or GROQ_API_KEY in .env to enable speech transcription.')
    try:
        result=Groq(api_key=settings.groq_api_key).audio.transcriptions.create(
            model=settings.groq_transcription_model,
            file=(file.filename or 'voice.webm', data),
        )
        return {'text':result.text}
    except Exception as exc:
        print('Transcription error:',repr(exc),flush=True)
        raise HTTPException(502,'Speech transcription unavailable')


@app.post('/api/speak')
def speak(payload:SpeechRequest,authorization:str|None=Header(default=None)):
    auth(authorization)
    if not settings.sarvam_api_key:
        raise HTTPException(503,'Set SARVAM_API_KEY in .env to enable multilingual speech.')
    language_speakers = TTS_SPEAKERS.get(payload.language_code)
    if not language_speakers:
        raise HTTPException(400,'Unsupported speech language. Choose English, Hindi, Bengali, Gujarati, Kannada, Marathi, Punjabi, Tamil, or Telugu.')
    model = settings.sarvam_tts_model
    if model == 'bulbul:v3':
        speaker = 'shubh' if payload.voice_gender == 'male' else 'ishita'
    elif model == 'bulbul:v2':
        speaker = 'abhilash' if payload.voice_gender == 'male' else 'anushka'
    else:
        speaker = language_speakers[payload.voice_gender]
        if model == 'bulbul:v4-flash' and payload.language_code == 'ta-IN' and payload.voice_gender == 'female':
            model = 'bulbul:v3'
    try:
        response = httpx.post(
            'https://api.sarvam.ai/text-to-speech',
            headers={'api-subscription-key': settings.sarvam_api_key},
            json={
                'text': payload.text,
                'model': model,
                'language_code': payload.language_code,
                'speaker': speaker,
            },
            timeout=60,
        )
        response.raise_for_status()
        encoded_audio = response.json().get('audios')
        if not isinstance(encoded_audio, list) or not encoded_audio or not all(isinstance(item, str) for item in encoded_audio):
            raise HTTPException(502,'Speech synthesis returned an invalid audio response.')
        audio = base64.b64decode(''.join(encoded_audio), validate=True)
        return Response(content=audio, media_type='audio/wav')
    except httpx.HTTPError as exc:
        print('Sarvam speech error:',repr(exc),flush=True)
        raise HTTPException(502,'Multilingual speech synthesis unavailable. Check Sarvam API access and try again.')
    except (KeyError, ValueError) as exc:
        print('Invalid Sarvam speech response:',repr(exc),flush=True)
        raise HTTPException(502,'Speech synthesis returned invalid audio data.')
