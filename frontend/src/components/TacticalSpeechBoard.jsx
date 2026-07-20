import React, { useState, useEffect, useRef } from 'react';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English (US/UK)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'as', name: 'Assamese (অসমীয়া)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'brx', name: 'Bodo (বড়ো)' },
  { code: 'doi', name: 'Dogri (ডোগরী)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ks', name: 'Kashmiri (कॉशुर)' },
  { code: 'kok', name: 'Konkani (कोंकणी)' },
  { code: 'mai', name: 'Maithili (মৈথিলী)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'mni', name: 'Manipuri / Meitei (মৈতৈলোন)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'ne', name: 'Nepali (नेपाली)' },
  { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'sa', name: 'Sanskrit (संस्कृतम्)' },
  { code: 'sat', name: 'Santhali (সাঁওতালী)' },
  { code: 'sd', name: 'Sindhi (सिंधी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'ur', name: 'Urdu (اُردُو)' },
];

export default function TacticalSpeechBoard() {
  const [isRecording, setIsRecording]           = useState(false);
  // paragraphs: array of { langCode, langName, text }
  const [paragraphs, setParagraphs]             = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('OFFLINE');
  const [inputLanguage, setInputLanguage]       = useState('en');
  const [targetLanguage, setTargetLanguage]     = useState('te');

  const socketRef      = useRef(null);
  const audioCtxRef    = useRef(null);
  const processorRef   = useRef(null);
  const gainRef        = useRef(null);
  const streamRef      = useRef(null);
  const terminalEndRef = useRef(null);
  const heartbeatRef   = useRef(null);
  const keepAliveRef   = useRef(null);
  const isRecordingRef = useRef(false);

  // ── WebSocket connection ───────────────────────────────────────────────────

  function stopHeartbeat() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  }

  function startHeartbeat(ws, input, target) {
    stopHeartbeat();
    // Ping the WebSocket every 25s to keep the connection and Render alive
    heartbeatRef.current = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);

    // Also ping the backend HTTP endpoint every 10 minutes to prevent Render sleeping
    const backendBase = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/stream-stt/')
      .replace('wss://', 'https://')
      .replace('ws://', 'http://')
      .replace('/ws/stream-stt/', '/');
    keepAliveRef.current = setInterval(() => {
      fetch(backendBase, { mode: 'no-cors' }).catch(() => {});
    }, 8 * 60 * 1000); // Every 8 minutes
  }

  function connectWebSocket(input, target) {
    stopHeartbeat();
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    // Use environment variable if deployed, otherwise fallback to local server
    const baseUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/stream-stt/';
    const wsUrl = `${baseUrl}?input=${input}&target=${target}`;
    
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnectionStatus('SECURE CONNECTED');
      startHeartbeat(ws, input, target);
      console.log('[WS] Connected');
    };
    ws.onclose = (ev) => {
      setConnectionStatus('DISCONNECTED');
      stopHeartbeat();
      console.warn('[WS] Closed:', ev.code, ev.reason);
      // Auto-reconnect after 3 seconds if we were recording
      if (isRecordingRef.current) {
        setConnectionStatus('RECONNECTING...');
        setTimeout(() => connectWebSocket(input, target), 3000);
      }
    };
    ws.onerror = () => {
      setConnectionStatus('ERROR - Retrying...');
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.status === 'interim' || payload.status === 'final') && payload.transcript) {
          const lc      = payload.lang;
          const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === lc);
          const lname   = langObj ? langObj.name.split(' ')[0] : lc.toUpperCase();
          const isFinal = payload.status === 'final';
          
          setParagraphs((prev) => {
            const updated = [...prev];
            const last = updated.length > 0 ? updated[updated.length - 1] : null;

            if (last && !last.isFinal && last.langCode === lc) {
              last.text = payload.transcript;
              last.isFinal = isFinal;
            } else {
              updated.push({
                langCode: lc,
                langName: lname,
                text: payload.transcript,
                isFinal: isFinal,
              });
            }
            return updated;
          });
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    socketRef.current = ws;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWebSocket(inputLanguage, targetLanguage);
    return () => {
      stopHeartbeat();
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [paragraphs]);

  // ── Language change ────────────────────────────────────────────────────────

  function handleLanguageChange(type, lang) {
    let currentInput = inputLanguage;
    let currentTarget = targetLanguage;

    if (type === 'input') {
      setInputLanguage(lang);
      currentInput = lang;
    } else {
      setTargetLanguage(lang);
      currentTarget = lang;
      
      // Start a fresh paragraph block only if target language changes
      const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
      const lname   = langObj ? langObj.name.split(' ')[0] : lang.toUpperCase();
      setParagraphs((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.text) {
          return [...prev, { langCode: lang, langName: lname, text: '' }];
        }
        return prev;
      });
    }

    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'CHANGE_LANGUAGE', input: currentInput, target: currentTarget }));
    } else {
      connectWebSocket(currentInput, currentTarget);
    }
  }

  // ── Recording start ────────────────────────────────────────────────────────

  async function startRecording() {
    isRecordingRef.current = true;
    try {
      // Ensure socket is open
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket(inputLanguage, targetLanguage);
        await new Promise((resolve, reject) => {
          // Increased timeout to 8s to allow Render cold start
          const t = setTimeout(() => reject(new Error('WebSocket timeout — backend may be waking up, please try again in 30 seconds')), 8000);
          const iv = setInterval(() => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              clearTimeout(t); clearInterval(iv); resolve();
            }
          }, 50);
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      // Send actual sample rate to backend for correct resampling
      socketRef.current.send(JSON.stringify({ type: 'SAMPLE_RATE', rate: ctx.sampleRate }));

      const source    = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          // .slice() makes an owned copy so the buffer isn't detached before send
          const samples = e.inputBuffer.getChannelData(0).slice(0);
          ws.send(samples.buffer);
        }
      };

      // Silent gain: keeps ScriptProcessor alive without echo/feedback
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      gainRef.current = silentGain;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      setIsRecording(true);
    } catch (err) {
      console.error('[AUDIO]', err);
      alert(`Microphone error: ${err.message}`);
    }
  }

  // ── Recording stop ─────────────────────────────────────────────────────────

  function stopRecording() {
    isRecordingRef.current = false;
    try { processorRef.current?.disconnect(); } catch (_) {}
    try { gainRef.current?.disconnect(); } catch (_) {}
    try { audioCtxRef.current?.close(); } catch (_) {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    processorRef.current = null;
    gainRef.current      = null;
    audioCtxRef.current  = null;
    streamRef.current    = null;
    setIsRecording(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#121714', color: '#f1f5f3', fontFamily: 'monospace', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '900px', backgroundColor: '#1c2420', border: '2px solid #2e3b34', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>

        {/* ── Header ── */}
        <div style={{ backgroundColor: '#2e3b34', padding: '16px 24px', borderBottom: '1px solid #44574c', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', letterSpacing: '2px', color: '#d4af37' }}>
            VOICE BRIDGE AI // 23 TACTICAL MATRIX
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Input Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#121714', border: '1px solid #44574c', borderRadius: '6px', padding: '4px 10px' }}>
              <span style={{ fontSize: '11px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '1px' }}>Input:</span>
              <select
                value={inputLanguage}
                onChange={(e) => handleLanguageChange('input', e.target.value)}
                style={{ background: 'transparent', color: '#fff', fontSize: '13px', fontWeight: 'bold', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={`in-${lang.code}`} value={lang.code} style={{ backgroundColor: '#1c2420', color: '#fff' }}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Output Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#121714', border: '1px solid #44574c', borderRadius: '6px', padding: '4px 10px' }}>
              <span style={{ fontSize: '11px', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '1px' }}>Output:</span>
              <select
                value={targetLanguage}
                onChange={(e) => handleLanguageChange('target', e.target.value)}
                style={{ background: 'transparent', color: '#fff', fontSize: '13px', fontWeight: 'bold', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={`out-${lang.code}`} value={lang.code} style={{ backgroundColor: '#1c2420', color: '#fff' }}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isRecording ? '#ef4444' : '#d4af37', display: 'inline-block', animation: isRecording ? 'pulse 1s infinite' : 'none' }} />
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: connectionStatus === 'SECURE CONNECTED' ? '#4ade80' : '#d4af37' }}>
                {connectionStatus}
              </span>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Mic Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', backgroundColor: '#121714', border: '1px solid #2e3b34', borderRadius: '8px', gap: '12px' }}>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                padding: '14px 40px',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '13px',
                letterSpacing: '3px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                border: isRecording ? '1px solid #dc2626' : '1px solid #d4af37',
                backgroundColor: isRecording ? '#450a0a' : '#2e3b34',
                color: isRecording ? '#f87171' : '#d4af37',
                transition: 'all 0.2s',
              }}
            >
              {isRecording ? '■  HALT LIVE RECONNAISSANCE' : '▶  INITIALIZE LIVE CAPTURE'}
            </button>
            {isRecording && (
              <span style={{ fontSize: '11px', color: '#4ade80', letterSpacing: '2px', textTransform: 'uppercase' }}>
                ● Microphone Active — Processing speech...
              </span>
            )}
          </div>

          {/* Transcript Terminal */}
          <div style={{ backgroundColor: '#000', border: '1px solid #2e3b34', borderRadius: '8px', padding: '16px', height: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '11px', color: '#44574c', borderBottom: '1px solid #1c2420', paddingBottom: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              --- Real-Time Transcribed Readout Terminal ---
            </div>
            {paragraphs.length === 0 && (
              <span style={{ color: '#44574c', fontSize: '13px', fontStyle: 'italic' }}>
                System standby. Press INITIALIZE LIVE CAPTURE to begin...
              </span>
            )}
            {paragraphs.map((para, idx) =>
              para.text ? (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.8 }}>
                    [{para.langName}]
                  </span>
                  <p style={{ margin: 0, fontSize: '14px', color: para.isFinal ? '#4ade80' : '#86efac', opacity: para.isFinal ? 1 : 0.8, lineHeight: '1.7', borderLeft: '2px solid #d4af37', paddingLeft: '12px' }}>
                    {para.text} {para.isFinal ? '' : '...'}
                  </p>
                </div>
              ) : null
            )}
            <div ref={terminalEndRef} />
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        select option { background-color: #1c2420; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #121714; }
        ::-webkit-scrollbar-thumb { background: #44574c; border-radius: 3px; }
      `}</style>
    </div>
  );
}
