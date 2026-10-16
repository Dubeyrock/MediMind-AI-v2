import { useEffect, useRef, useState } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const detail = text.trim().slice(0, 200);
    throw new Error(detail || `Server returned an invalid response (HTTP ${response.status}).`);
  }
}

const initialMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi, I'm MedGuide. I can help explain general health topics using the available knowledge base and web research. What would you like to understand?",
};

const suggestedQuestions = [
  'What can cause a persistent headache?',
  'How can I prepare for a doctor visit?',
  'Explain the difference between a virus and bacteria',
];

const CONVERSATIONS_STORAGE_KEY = 'medguide.saved-conversations.v1';
const THEME_STORAGE_KEY = 'medguide.theme.v1';
const VOICE_GENDER_STORAGE_KEY = 'medguide.voice-gender.v1';

function readTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readSpeechGender() {
  try {
    return localStorage.getItem(VOICE_GENDER_STORAGE_KEY) === 'male' ? 'male' : 'female';
  } catch {
    return 'female';
  }
}

function readSavedConversations() {
  try {
    const conversations = JSON.parse(localStorage.getItem(CONVERSATIONS_STORAGE_KEY) || '[]');
    return Array.isArray(conversations)
      ? conversations.filter((conversation) =>
        typeof conversation.id === 'string'
        && typeof conversation.title === 'string'
        && Number.isFinite(conversation.updatedAt)
        && Array.isArray(conversation.messages)
        && Array.isArray(conversation.history),
      )
      : [];
  } catch {
    return [];
  }
}

const speechLanguages = [
  { value: 'auto', label: 'Auto', locale: '' },
  { value: 'en', label: 'English', locale: 'en-IN' },
  { value: 'hi', label: 'Hindi', locale: 'hi-IN' },
  { value: 'bn', label: 'Bengali', locale: 'bn-IN' },
  { value: 'ta', label: 'Tamil', locale: 'ta-IN' },
  { value: 'te', label: 'Telugu', locale: 'te-IN' },
  { value: 'mr', label: 'Marathi', locale: 'mr-IN' },
  { value: 'gu', label: 'Gujarati', locale: 'gu-IN' },
  { value: 'kn', label: 'Kannada', locale: 'kn-IN' },
  { value: 'pa', label: 'Punjabi', locale: 'pa-IN' },
];

function detectSpeechLanguage(text) {
  const scripts = [
    { language: 'bn', pattern: /[\u0980-\u09ff]/g },
    { language: 'pa', pattern: /[\u0a00-\u0a7f]/g },
    { language: 'gu', pattern: /[\u0a80-\u0aff]/g },
    { language: 'ta', pattern: /[\u0b80-\u0bff]/g },
    { language: 'te', pattern: /[\u0c00-\u0c7f]/g },
    { language: 'kn', pattern: /[\u0c80-\u0cff]/g },
    { language: 'ml', pattern: /[\u0d00-\u0d7f]/g },
    { language: 'hi', pattern: /[\u0900-\u097f]/g },
    { language: 'ur', pattern: /[\u0600-\u06ff]/g },
  ];

  const detected = scripts
    .map(({ language, pattern }) => ({ language, count: (text.match(pattern) || []).length }))
    .sort((first, second) => second.count - first.count)[0];
  return detected?.count ? detected.language : 'en';
}

function cleanAssistantText(text) {
  return text
    .replace(/```[\w-]*\s*([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>+\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\[PDF\s*p\.\s*(\d+)\]/gi, 'PDF page $1')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\*\*|__|~~|[*_]/g, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function Icon({ name, size = 18 }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m3 0V4h8v2m-7 4v6m4-6v6" /></>,
    moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    send: <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    paperclip: <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
    camera: <><path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-2-3Z" /><circle cx="12" cy="13" r="3" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 1.3 2.7L23 18l-2.7 1.3L19 22l-1.3-2.7L15 18l2.7-1.3L19 14Z" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Message({ message, assistantName }) {
  return (
    <article className={`message message--${message.role}`}>
      {message.role === 'assistant' && (
        <div className="message__avatar" aria-hidden="true">✚</div>
      )}
      <div className="message__body">
        <div className="message__label">
          {message.role === 'assistant' ? assistantName : 'You'}
          {message.pending && <span className="typing-dots" aria-label="Thinking"><i /><i /><i /></span>}
        </div>
        {message.image && (
          <img className="message__image" src={message.image} alt="Image attached to your question" />
        )}
        {message.imageAttached && !message.image && (
          <span className="message__attachment-note">Image was attached; image files are not saved in chat history.</span>
        )}
        <div className={`message__text${message.error ? ' message__text--error' : ''}`}>
          {message.role === 'assistant' && !message.pending
            ? cleanAssistantText(message.content)
            : message.content}
        </div>
        {message.sources?.length > 0 && (
          <div className="sources">
            <span className="sources__title">Sources</span>
            {message.sources.slice(0, 8).map((source, index) =>
              source.type === 'pdf' ? (
                <span className="source-chip" key={`${source.type}-${source.page}-${index}`}>
                  <Icon name="book" size={13} /> Reference PDF · p. {source.page}
                </span>
              ) : (
                <a
                  className="source-chip source-chip--link"
                  href={source.url}
                  key={`${source.url}-${index}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="globe" size={13} />
                  {source.title || source.url}
                  <Icon name="arrow" size={12} />
                </a>
              ),
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
      <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
    </button>
  );
}

function LandingPage({ status, onStart, theme, onToggleTheme }) {
  const [question, setQuestion] = useState('');

  return (
    <main className="landing">
      <header className="landing-nav">
        <a className="brand" href="/" aria-label="MedGuide home">
          <span className="brand__mark">✚</span>
          <span className="brand__text">MedGuide<span>.ai</span></span>
        </a>
        <nav className="landing-nav__links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#your-safety">Your safety</a>
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="landing-nav__cta" type="button" onClick={() => onStart()}>
            Open MedGuide <Icon name="arrow" size={15} />
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="landing-eyebrow"><span /> A CLEARER WAY TO EXPLORE HEALTH</div>
          <h1>Health questions<br />deserve <span>clear answers.</span></h1>
          <p className="landing-hero__description">
            Explore health topics in plain language, understand your sources, and feel more prepared for a conversation with your care team.
          </p>
          <form
            className="landing-prompt"
            onSubmit={(event) => {
              event.preventDefault();
              onStart(question.trim());
            }}
          >
            <label className="sr-only" htmlFor="landing-question">What would you like to understand?</label>
            <input
              id="landing-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What would you like to understand?"
              maxLength={4000}
            />
            <button type="submit" aria-label="Start asking MedGuide">
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="landing-hero__meta">
            <span><Icon name="shield" size={15} /> Education, not diagnosis</span>
            <span className={`landing-status landing-status--${status.kind}`}><i /> {status.label}</span>
          </div>
        </div>

        <div className="landing-art" aria-label="Illustration of the MedGuide health information assistant">
          <div className="landing-art__halo" />
          <div className="landing-art__spark landing-art__spark--one"><Icon name="spark" size={20} /></div>
          <div className="landing-art__spark landing-art__spark--two"><Icon name="plus" size={16} /></div>
          <div className="health-card">
            <div className="health-card__top">
              <div className="health-card__brand"><span>✚</span> Your health notes</div>
              <span className="health-card__more">···</span>
            </div>
            <div className="health-card__greeting">A little clarity goes a long way.</div>
            <div className="health-card__question">
              <span className="health-card__question-icon"><Icon name="spark" size={16} /></span>
              <div><span>YOUR QUESTION</span><strong>How can I sleep better?</strong></div>
            </div>
            <div className="health-card__answer">
              <div className="health-card__answer-head"><span className="health-card__mini-mark">✚</span> MedGuide <span className="health-card__answer-dot" /></div>
              <div className="health-card__line health-card__line--long" />
              <div className="health-card__line health-card__line--medium" />
              <div className="health-card__line health-card__line--short" />
              <div className="health-card__sources"><Icon name="book" size={13} /> Helpful sources included</div>
            </div>
            <div className="health-card__bottom"><Icon name="shield" size={14} /> Made for learning, with care</div>
          </div>
          <div className="landing-art__badge"><span>✳</span><div><strong>Curiosity welcome</strong><small>Start with any question</small></div></div>
        </div>
      </section>

      <section className="landing-trust" aria-label="MedGuide features">
        <span>HERE TO HELP YOU EXPLORE</span>
        <div><Icon name="book" size={17} /> Grounded in available references</div>
        <div><Icon name="globe" size={17} /> Web research when available</div>
        <div><Icon name="shield" size={17} /> Clear about its limitations</div>
      </section>

      <section className="landing-features" id="how-it-works">
        <div className="landing-section-heading">
          <span className="landing-eyebrow">A MORE THOUGHTFUL START</span>
          <h2>Understand more.<br /><span>Without the overwhelm.</span></h2>
          <p>Get a helpful starting point for the questions you want to ask.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-card__icon feature-card__icon--green"><Icon name="spark" size={20} /></div>
            <span className="feature-card__number">01 / ASK</span>
            <h3>Start with what’s on your mind</h3>
            <p>Ask in everyday language. You can also share an image or use your voice.</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon feature-card__icon--blue"><Icon name="book" size={20} /></div>
            <span className="feature-card__number">02 / EXPLORE</span>
            <h3>Get context you can follow</h3>
            <p>Explore a clear explanation informed by the knowledge sources available to the assistant.</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon feature-card__icon--gold"><Icon name="shield" size={20} /></div>
            <span className="feature-card__number">03 / PREPARE</span>
            <h3>Take better questions forward</h3>
            <p>Use what you learn to prepare for a conversation with a qualified health professional.</p>
          </article>
        </div>
      </section>

      <section className="landing-safety" id="your-safety">
        <div className="landing-safety__icon"><Icon name="shield" size={22} /></div>
        <div>
          <span className="landing-eyebrow">IMPORTANT TO KNOW</span>
          <h2>A helpful guide, not a substitute for care.</h2>
          <p>MedGuide is an educational tool, not a doctor. It can make mistakes and cannot diagnose or treat medical conditions. For personal medical advice, speak with a qualified health professional. If this may be an emergency, contact your local emergency services.</p>
        </div>
        <button type="button" onClick={() => onStart()}>
          Ask a question <Icon name="arrow" size={16} />
        </button>
      </section>

      <footer className="landing-footer">
        <a className="brand" href="/" aria-label="MedGuide home">
          <span className="brand__mark">✚</span>
          <span className="brand__text">MedGuide<span>.ai</span></span>
        </a>
        <span>Made for curious minds. For educational purposes only.</span>
      </footer>
    </main>
  );
}

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [savedConversations, setSavedConversations] = useState(readSavedConversations);
  const [messages, setMessages] = useState([initialMessage]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [imageData, setImageData] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState({ label: 'Connecting', kind: 'checking' });
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [deletingConversationId, setDeletingConversationId] = useState('');
  const [lastAnswer, setLastAnswer] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState('auto');
  const [speechGender, setSpeechGender] = useState(readSpeechGender);
  const messagesEndRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chatRequestControllerRef = useRef(null);
  const speechRequestControllerRef = useRef(null);
  const conversationIdRef = useRef('');
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const recordingTimeoutRef = useRef(null);
  const assistantName = speechGender === 'female' ? 'MedGuide Asha' : 'MedGuide Arjun';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      setNotice('Theme preference could not be saved in this browser.');
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_GENDER_STORAGE_KEY, speechGender);
    } catch {
      setNotice('Voice preference could not be saved in this browser.');
    }
  }, [speechGender]);

  useEffect(() => {
    try {
      localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(savedConversations));
    } catch (error) {
      setNotice(`Chat history could not be saved in this browser: ${error.message}`);
    }
  }, [savedConversations]);

  const startChat = (question = '') => {
    setMessage(question);
    setShowChat(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleTheme = () => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const response = await fetch(apiUrl('/api/health'));
        if (!response.ok) throw new Error('Health check failed');
        const data = await readApiResponse(response);
        if (active) {
          setStatus(data.configured
            ? { label: 'Services ready', kind: 'ready' }
            : { label: 'Setup needed', kind: 'warning' });
        }
      } catch {
        if (active) setStatus({ label: 'Server offline', kind: 'offline' });
      }
    };
    checkHealth();
    return () => {
      active = false;
      window.clearTimeout(recordingTimeoutRef.current);
      chatRequestControllerRef.current?.abort();
      speechRequestControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraOpen]);

  const authHeaders = () => {
    const headers = {};
    if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    return headers;
  };

  const loadImage = (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
      setNotice('Choose a PNG, JPEG, or WebP image under 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(String(reader.result));
      setNotice('');
    };
    reader.onerror = () => setNotice('The selected image could not be read. Please try another file.');
    reader.readAsDataURL(file);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const question = message.trim();
    if (!question || sending || deletingConversationId) return;

    const userId = `user-${Date.now()}`;
    const answerId = `answer-${Date.now()}`;
    const submittedImage = imageData;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', content: question, image: submittedImage },
      { id: answerId, role: 'assistant', content: '', pending: true },
    ]);
    setMessage('');
    setImageData('');
    setNotice('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);
    const requestController = new AbortController();
    chatRequestControllerRef.current = requestController;

    try {
      const headers = {
        ...authHeaders(),
        'Content-Type': 'application/json',
      };
      if (conversationIdRef.current) headers['X-Conversation-ID'] = conversationIdRef.current;
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers,
        signal: requestController.signal,
        body: JSON.stringify({
          message: question,
          history: history.slice(-8),
          image_data: submittedImage || null,
        }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.detail || 'The request could not be completed.');
      conversationIdRef.current = data.conversation_id || conversationIdRef.current;
      const updatedHistory = [
        ...history,
        { role: 'user', content: question },
        { role: 'assistant', content: data.answer },
      ].slice(-10);
      const updatedMessages = [
        ...messages,
        { id: userId, role: 'user', content: question, imageAttached: Boolean(submittedImage) },
        { id: answerId, role: 'assistant', content: data.answer, sources: data.sources || [] },
      ];
      setLastAnswer(data.answer);
      setHistory(updatedHistory);
      setMessages(updatedMessages);
      setSavedConversations((current) => [{
        id: data.conversation_id,
        title: updatedMessages.find((item) => item.role === 'user')?.content || question,
        updatedAt: Date.now(),
        messages: updatedMessages.map(({ id, role, content, sources, imageAttached, image }) => ({
          id,
          role,
          content,
          ...(sources ? { sources } : {}),
          ...(imageAttached || image ? { imageAttached: true } : {}),
        })),
        history: updatedHistory,
      }, ...current.filter((conversation) => conversation.id !== data.conversation_id)]);
    } catch (error) {
      const wasStopped = error.name === 'AbortError';
      setMessages((current) => current.map((item) => item.id === answerId
        ? {
          ...item,
          content: wasStopped ? 'Response stopped. You can ask another question.' : `I couldn't get an answer: ${error.message}`,
          pending: false,
          error: !wasStopped,
        }
        : item));
    } finally {
      if (chatRequestControllerRef.current === requestController) {
        chatRequestControllerRef.current = null;
        setSending(false);
      }
    }
  };

  const stopResponse = () => {
    if (!chatRequestControllerRef.current) return;
    setNotice('Stopped waiting for the response. The server may finish processing in the background.');
    chatRequestControllerRef.current.abort();
  };

  const openSavedConversation = (conversation) => {
    if (sending || deletingConversationId) return;
    setMessages(conversation.messages);
    setHistory(conversation.history);
    conversationIdRef.current = conversation.id;
    setLastAnswer([...conversation.messages].reverse().find((item) =>
      item.role === 'assistant' && !item.error && !item.pending,
    )?.content || '');
    setMessage('');
    setNotice('');
    setShowChat(true);
  };

  const startNewConversation = () => {
    if (sending) return;
    setMessages([initialMessage]);
    setHistory([]);
    setLastAnswer('');
    setMessage('');
    setImageData('');
    conversationIdRef.current = '';
    setNotice('');
  };

  const deleteSavedConversation = async (conversation) => {
    if (sending || deletingConversationId) return;
    if (!window.confirm(`Delete this saved conversation?\n\n${conversation.title}`)) return;
    setDeletingConversationId(conversation.id);
    let serverDeleteError = '';
    try {
      const response = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(conversation.id)}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await readApiResponse(response);
        throw new Error(data.detail || 'The server could not delete this conversation.');
      }
    } catch (error) {
      serverDeleteError = error.message;
    } finally {
      setSavedConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (conversationIdRef.current === conversation.id) startNewConversation();
      setDeletingConversationId('');
      setNotice(serverDeleteError
        ? `Removed from this browser, but the server copy could not be deleted: ${serverDeleteError}`
        : 'Conversation deleted.');
    }
  };

  const toggleRecording = async () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Audio recording is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        window.clearTimeout(recordingTimeoutRef.current);
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('file', new Blob(chunks, { type: recorder.mimeType }), 'voice.webm');
          const response = await fetch(apiUrl('/api/transcribe'), {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
          });
          const data = await readApiResponse(response);
          if (!response.ok) throw new Error(data.detail || 'Transcription failed.');
          setMessage((current) => [current, data.text].filter(Boolean).join(' '));
        } catch (error) {
          setNotice(error.message);
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
      setNotice('');
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setRecording(false);
        }
      }, 29_000);
    } catch (error) {
      setNotice(`Microphone unavailable: ${error.message}`);
    }
  };

  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOpen(true);
      setNotice('');
    } catch (error) {
      setNotice(`Camera unavailable: ${error.message}`);
    }
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  };

  const captureImage = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setNotice('The camera is not ready yet. Please wait and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) loadImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
      else setNotice('The camera image could not be captured.');
    }, 'image/jpeg', 0.85);
    closeCamera();
  };

  const stopAudio = () => {
    speechRequestControllerRef.current?.abort();
    speechRequestControllerRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = '';
    setSpeaking(false);
    setNotice('Audio stopped.');
  };

  const readAnswer = async () => {
    if (!lastAnswer) {
      setNotice('Ask a question first to hear an answer.');
      return;
    }
    const cleanAnswer = cleanAssistantText(lastAnswer);
    if (cleanAnswer.length > 2500) {
      setNotice('This answer is too long for one voice request. Ask for a shorter answer, then try Listen again.');
      return;
    }
    const detectedLanguage = speechLanguage === 'auto'
      ? detectSpeechLanguage(cleanAnswer)
      : speechLanguage;
    const language = speechLanguages.find((item) => item.value === detectedLanguage) || speechLanguages[1];
    const requestController = new AbortController();
    speechRequestControllerRef.current = requestController;
    setSpeaking(true);
    setNotice('');
    try {
      const response = await fetch(apiUrl('/api/speak'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        signal: requestController.signal,
        body: JSON.stringify({
          text: cleanAnswer,
          language_code: language.locale,
          voice_gender: speechGender,
        }),
      });
      if (!response.ok) {
        const error = await readApiResponse(response);
        throw new Error(error.detail || 'Speech playback is unavailable.');
      }
      const audioBlob = await response.blob();
      if (requestController.signal.aborted) return;
      audioUrlRef.current = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrlRef.current);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = '';
        audioRef.current = null;
        setSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = '';
        audioRef.current = null;
        setSpeaking(false);
        setNotice('The generated audio could not be played. Please try again.');
      };
      await audio.play();
      if (speechRequestControllerRef.current === requestController) {
        speechRequestControllerRef.current = null;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = '';
      setSpeaking(false);
      setNotice(error.message);
    } finally {
      if (speechRequestControllerRef.current === requestController) {
        speechRequestControllerRef.current = null;
      }
    }
  };

  if (!showChat) {
    return <LandingPage status={status} onStart={startChat} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand brand--button" type="button" onClick={() => setShowChat(false)} aria-label="Back to MedGuide home">
          <span className="brand__mark">✚</span>
          <span className="brand__text">MedGuide<span>.ai</span></span>
        </button>
        <div className="topbar__actions">
          <div className={`connection connection--${status.kind}`}>
            <span className="connection__dot" />
            {status.label}
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar__intro">
            <div className="eyebrow"><Icon name="spark" size={14} /> YOUR HEALTH COMPANION</div>
            <h1>Better questions.<br /><span>Clearer answers.</span></h1>
            <p>A thoughtful place to explore health information and prepare for conversations with your care team.</p>
          </div>

          <div className="side-card">
            <div className="side-card__icon"><Icon name="book" size={19} /></div>
            <div><strong>Knowledge grounded</strong><p>Answers can draw on the medical reference and web research.</p></div>
          </div>
          <div className="side-card">
            <div className="side-card__icon side-card__icon--mint"><Icon name="shield" size={19} /></div>
            <div><strong>Made for learning</strong><p>Use this to understand topics, not to replace professional care.</p></div>
          </div>

          <section className="history-panel" aria-label="Saved conversations">
            <div className="history-panel__heading">
              <div><strong>Past chats</strong><span>{savedConversations.length ? `${savedConversations.length} saved` : 'Saved on this browser'}</span></div>
              <button
                type="button"
                className="history-panel__new"
                onClick={startNewConversation}
                disabled={sending || Boolean(deletingConversationId)}
              >
                <Icon name="plus" size={14} /> New
              </button>
            </div>
            {savedConversations.length === 0 ? (
              <p className="history-panel__empty">Your completed conversations will appear here.</p>
            ) : (
              <div className="history-list">
                {savedConversations.map((conversation) => (
                  <div
                    className={`history-item${conversationIdRef.current === conversation.id ? ' history-item--active' : ''}`}
                    key={conversation.id}
                  >
                    <button
                      type="button"
                      className="history-item__open"
                      onClick={() => openSavedConversation(conversation)}
                      title={conversation.title}
                      disabled={sending || Boolean(deletingConversationId)}
                    >
                      <span>{conversation.title}</span>
                      <time dateTime={new Date(conversation.updatedAt).toISOString()}>
                        {new Date(conversation.updatedAt).toLocaleDateString()}
                      </time>
                    </button>
                    <button
                      type="button"
                      className="history-item__delete"
                      aria-label={`Delete conversation: ${conversation.title}`}
                      title="Delete conversation"
                      disabled={sending || Boolean(deletingConversationId)}
                      onClick={() => deleteSavedConversation(conversation)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="history-panel__privacy">Stored only in this browser, not encrypted or synced. Attached images are not saved.</p>
          </section>

          <div className="sidebar__safety">
            <span className="sidebar__safety-icon"><Icon name="shield" size={16} /></span>
            <div><strong>A note on safety</strong><p>If someone may be in immediate danger, contact local emergency services now.</p></div>
          </div>
          <div className="sidebar__footer">PRIVATE SESSION <span>·</span> EDUCATIONAL USE</div>
        </aside>

        <section className="chat-panel" aria-label="Medical education chat">
          <div className="chat-panel__header">
            <div className="assistant-identity">
              <div className="assistant-identity__avatar">✚</div>
              <div><strong>{assistantName}</strong><span><i /> {speechGender === 'female' ? 'Female' : 'Male'} voice · Here to help you learn</span></div>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Start a new conversation"
              title="Start a new conversation"
              disabled={sending || Boolean(deletingConversationId)}
              onClick={startNewConversation}
            >
              <Icon name="plus" size={19} />
            </button>
          </div>

          <div className="conversation" aria-live="polite">
            {messages.length === 1 && (
              <div className="welcome">
                <div className="welcome__spark"><Icon name="spark" size={21} /></div>
                <h2>What’s on your mind?</h2>
                <p>Ask a health question, explore a topic, or share an image to discuss what’s visible.</p>
                <div className="suggestions">
                  <span>TRY ASKING</span>
                  {suggestedQuestions.map((question) => (
                    <button type="button" key={question} onClick={() => setMessage(question)}>
                      {question}<Icon name="arrow" size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((item) => <Message key={item.id} message={item} assistantName={assistantName} />)}
            <div ref={messagesEndRef} />
          </div>

          {cameraOpen && (
            <div className="camera-preview">
              <video ref={videoRef} autoPlay playsInline aria-label="Camera preview" />
              <div className="camera-preview__actions">
                <button type="button" className="button button--quiet" onClick={closeCamera}>Cancel</button>
                <button type="button" className="button button--dark" onClick={captureImage}>Capture photo</button>
              </div>
            </div>
          )}

          {imageData && (
            <div className="attachment-preview">
              <img src={imageData} alt="Selected attachment preview" />
              <span>Image attached</span>
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => {
                  setImageData('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )}

          <form className="composer" onSubmit={sendMessage}>
            {notice && <div className="notice" role="alert">{notice}</div>}
            <label className="sr-only" htmlFor="question">Your health question</label>
            <textarea
              id="question"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
              placeholder="Ask a question about your health..."
              rows={2}
              maxLength={4000}
              disabled={sending}
            />
            <div className="composer__bottom">
              <div className="composer__tools">
                <input
                  ref={fileInputRef}
                  id="image-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => loadImage(event.target.files?.[0])}
                />
                <button className="tool-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="paperclip" size={16} /><span>Attach image</span>
                </button>
                <button className="tool-button" type="button" onClick={openCamera}>
                  <Icon name="camera" size={16} /><span>Camera</span>
                </button>
                <button className={`tool-button${recording ? ' tool-button--recording' : ''}`} type="button" onClick={toggleRecording} disabled={transcribing}>
                  <Icon name="mic" size={16} /><span>{recording ? 'Stop recording' : transcribing ? 'Transcribing…' : 'Voice'}</span>
                </button>
                <button
                  className={`tool-button tool-button--listen${speaking ? ' tool-button--stop' : ''}`}
                  type="button"
                  aria-label={speaking ? 'Stop audio' : 'Listen to answer'}
                  title={speaking ? 'Stop audio playback' : 'Read the answer aloud'}
                  onClick={speaking ? stopAudio : readAnswer}
                >
                  <Icon name={speaking ? 'stop' : 'volume'} size={16} />
                  <span>{speaking ? 'Stop audio' : 'Listen'}</span>
                </button>
                <label className="sr-only" htmlFor="speech-language">Spoken answer language</label>
                <select
                  id="speech-language"
                  className="voice-select"
                  value={speechLanguage}
                  onChange={(event) => setSpeechLanguage(event.target.value)}
                  title="Select the language for read-aloud answers"
                >
                  {speechLanguages.map((language) => (
                    <option key={language.value} value={language.value}>{language.label}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="speech-gender">Assistant voice</label>
                <select
                  id="speech-gender"
                  className="voice-select voice-select--gender"
                  value={speechGender}
                  onChange={(event) => setSpeechGender(event.target.value)}
                  title="Choose a female or male assistant voice"
                >
                  <option value="female">Female voice</option>
                  <option value="male">Male voice</option>
                </select>
              </div>
              {sending ? (
                <button
                  className="send-button send-button--stop"
                  type="button"
                  aria-label="Stop response"
                  onClick={stopResponse}
                >
                  Stop <Icon name="stop" size={14} />
                </button>
              ) : (
                <button className="send-button" type="submit" disabled={Boolean(deletingConversationId) || !message.trim()}>
                  Send <Icon name="send" size={15} />
                </button>
              )}
            </div>
            <div className="composer__hint">AI can make mistakes. Please verify important information with a qualified professional.</div>
          </form>

          <details className="api-access">
            <summary>API access <span>Optional token</span></summary>
            <label htmlFor="api-token">API token</label>
            <input
              id="api-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Enter API_TOKEN if configured"
            />
          </details>
        </section>
      </div>
      <footer className="page-footer">MedGuide AI is for educational purposes only and does not provide diagnoses or treatment.</footer>
    </main>
  );
}
