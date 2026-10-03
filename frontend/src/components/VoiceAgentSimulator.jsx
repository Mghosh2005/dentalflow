import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Bot, Calendar, CheckCircle2, AlertTriangle, X, Send, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { api } from '../api/client';

export default function VoiceAgentSimulator({ mode = 'embedded', onCallEnded }) {
  const [isOpen, setIsOpen] = useState(mode === 'embedded');
  const [isCallActive, setIsCallActive] = useState(false);
  const [sessionType, setSessionType] = useState('call'); // 'call' | 'chat'
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Recording & Transcription states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [micStatusText, setMicStatusText] = useState('Whisper AI Audio Ready');
  const [micVolume, setMicVolume] = useState(0);
  const [micError, setMicError] = useState(null);
  const [callEndedSummary, setCallEndedSummary] = useState(null);

  // Conversation state
  const [messages, setMessages] = useState([]);
  const [context, setContext] = useState({
    caller_name: '',
    caller_phone: '',
    caller_email: '',
    intent: 'general_inquiry',
    booking_step: 'idle',
  });

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const elevenAudioRef = useRef(null);

  const contextRef = useRef(context);
  const messagesRef = useRef(messages);
  const isCallActiveRef = useRef(isCallActive);
  const sessionTypeRef = useRef(sessionType);
  const isAiSpeakingRef = useRef(isAiSpeaking);
  const isRecordingRef = useRef(isRecording);
  const isTranscribingRef = useRef(isTranscribing);
  const speechDetectedRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  const autoStopTimerRef = useRef(null);
  const maxRecordingTimerRef = useRef(null);
  const useBrowserSTTRef = useRef(false);
  const browserRecognitionRef = useRef(null);

  contextRef.current = context;
  messagesRef.current = messages;
  isCallActiveRef.current = isCallActive;
  sessionTypeRef.current = sessionType;
  isAiSpeakingRef.current = isAiSpeaking;
  isRecordingRef.current = isRecording;
  isTranscribingRef.current = isTranscribing;

  // Auto scroll transcript
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRecording, isTranscribing]);

  // Call duration timer
  useEffect(() => {
    if (isCallActive) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCallActive]);

  // Liveness guard: during active voice call, if AI is not speaking, not recording, not transcribing, and not muted, start listening
  useEffect(() => {
    if (!isCallActive || sessionType !== 'call' || isAiSpeaking || isRecording || isTranscribing || isMuted || micError) {
      return;
    }
    const guardTimer = setTimeout(() => {
      if (isCallActiveRef.current && sessionTypeRef.current === 'call' && !isAiSpeakingRef.current && !isRecordingRef.current && !isTranscribingRef.current && !isMuted) {
        console.log('[Liveness Guard] Call active and idle, initiating microphone listening...');
        startRecording();
      }
    }, 450);
    return () => clearTimeout(guardTimer);
  }, [isCallActive, sessionType, isAiSpeaking, isRecording, isTranscribing, isMuted, micError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const cleanupAudio = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }
    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.abort(); } catch (e) {}
      browserRecognitionRef.current = null;
    }
    speechDetectedRef.current = false;
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
    if (elevenAudioRef.current) {
      try {
        elevenAudioRef.current.pause();
        if (elevenAudioRef.current._objectUrl) {
          URL.revokeObjectURL(elevenAudioRef.current._objectUrl);
        }
      } catch (e) {}
      elevenAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsRecording(false);
    setIsTranscribing(false);
    setMicVolume(0);
  };

  // Browser Web Speech API Recognition (Cloud fallback for Render / no-torch environments)
  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError('Speech recognition is not supported in this browser. Please use Chrome or Edge, or type your message below.');
      return;
    }

    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.abort(); } catch (e) {}
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN'; // Indian English
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        setMicStatusText('🎙️ Listening... speak naturally');
      };

      recognition.onresult = (event) => {
        const speechResult = event.results[0]?.[0]?.transcript || '';
        console.log('[Browser STT] Recognized:', speechResult);
        setIsRecording(false);
        isRecordingRef.current = false;
        if (speechResult.trim()) {
          setMicStatusText(`✓ Recognized: "${speechResult.trim()}"`);
          handleUserSpeech(speechResult.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Browser STT] Notice:', event.error);
        setIsRecording(false);
        isRecordingRef.current = false;
        useBrowserSTTRef.current = false;
        if (event.error === 'network') {
          setMicError('Browser voice service blocked by browser (common in Brave). Please use Google Chrome / Edge, or add a free GROQ_API_KEY in AI Settings.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setMicError(`Voice notice: ${event.error}. You can also type below.`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        isRecordingRef.current = false;
      };

      browserRecognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('[Browser STT] Start exception:', e);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const speakTextFallback = (text) => {
    if (!window.speechSynthesis) {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      if (isCallActiveRef.current && !isMuted) startAutoListening();
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#`~]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Strictly enforce FEMALE ONLY voices — NEVER select a male voice (e.g. Ravi, David, Mark)
    const voices = window.speechSynthesis.getVoices();
    const isMaleVoice = (v) => {
      const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
      return n.includes('ravi') || n.includes('david') || n.includes('mark') || n.includes('george') || 
             n.includes('male') || n.includes('guy') || n.includes('man') || n.includes('boy') || 
             n.includes('james') || n.includes('stefan') || n.includes('prabhat') || n.includes('madhur') ||
             n.includes('daniel') || n.includes('oliver');
    };

    const isFemaleVoice = (v) => {
      const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
      return n.includes('heera') || n.includes('neerja') || n.includes('swara') || n.includes('female') ||
             n.includes('zira') || n.includes('samantha') || n.includes('victoria') || n.includes('karen') ||
             n.includes('fiona') || n.includes('hazel') || n.includes('serena') || n.includes('catherine');
    };

    // Priority 1: Indian English female voice
    let selectedVoice = voices.find(v => (v.lang === 'en-IN' || v.name.includes('India')) && !isMaleVoice(v) && isFemaleVoice(v));
    // Priority 2: Any Indian voice not male
    if (!selectedVoice) {
      selectedVoice = voices.find(v => (v.lang === 'en-IN' || v.name.includes('India')) && !isMaleVoice(v));
    }
    // Priority 3: Any English female voice
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('en') && !isMaleVoice(v) && isFemaleVoice(v));
    }
    // Priority 4: Any English voice not male
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('en') && !isMaleVoice(v));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1.15; // Raised pitch ensures a clear, warm female voice tone
    utterance.onend = () => {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      if (isCallActiveRef.current && !isMuted) startAutoListening();
    };
    utterance.onerror = () => {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      if (isCallActiveRef.current && !isMuted) startAutoListening();
    };
    window.speechSynthesis.speak(utterance);
  };

  const speakText = async (text) => {
    if (isAudioMuted) {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      startAutoListening();
      return;
    }

    stopRecording();
    isAiSpeakingRef.current = true;
    setIsAiSpeaking(true);

    // Stop any currently playing TTS audio
    if (elevenAudioRef.current) {
      try {
        elevenAudioRef.current.pause();
        if (elevenAudioRef.current._objectUrl) {
          URL.revokeObjectURL(elevenAudioRef.current._objectUrl);
        }
      } catch (e) {}
      elevenAudioRef.current = null;
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.warn('[TTS] TTS endpoint unavailable, falling back to browser TTS');
        speakTextFallback(text);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio._objectUrl = url;
      elevenAudioRef.current = audio;

      audio.onended = () => {
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        URL.revokeObjectURL(url);
        elevenAudioRef.current = null;
        if (isCallActiveRef.current && !isMuted) startAutoListening();
      };

      audio.onerror = (e) => {
        console.error('[TTS] Audio playback error, falling back:', e);
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        URL.revokeObjectURL(url);
        elevenAudioRef.current = null;
        speakTextFallback(text);
      };

      await audio.play();

    } catch (err) {
      console.warn('[TTS] Fetch failed, falling back to browser TTS:', err.message);
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      speakTextFallback(text);
    }
  };

  // Convert Audio Blob to Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Get or initialize audio stream
  const ensureAudioStream = async () => {
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      console.log('[STT] Reusing existing audio stream');
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try { await audioContextRef.current.resume(); } catch (e) {}
      }
      return mediaStreamRef.current;
    }
    console.log('[STT] Requesting microphone permission...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      console.log('[STT] Microphone stream acquired. Tracks:', stream.getAudioTracks().length);

      // AudioContext volume meter & VAD
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const monitorVolume = () => {
            if (!isCallActiveRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const vol = Math.min(100, Math.round(avg * 2.2));
            setMicVolume(vol);

            // Auto Voice Activity Detection (VAD) when recording
            if (isRecordingRef.current) {
              if (vol > 12) {
                // Speech detected (filter out room background noise)
                if (!speechDetectedRef.current) {
                  speechDetectedRef.current = true;
                  setMicStatusText('🎙️ Listening... (speak naturally)');
                }
                // Clear any pending auto-stop timer
                if (autoStopTimerRef.current) {
                  clearTimeout(autoStopTimerRef.current);
                  autoStopTimerRef.current = null;
                }
              } else if (speechDetectedRef.current && !autoStopTimerRef.current) {
                // Silence detected after speech — wait at least 1.6s of total recording before auto-stopping
                const elapsed = Date.now() - (recordingStartTimeRef.current || 0);
                if (elapsed > 1600) {
                  autoStopTimerRef.current = setTimeout(() => {
                    autoStopTimerRef.current = null;
                    if (isRecordingRef.current && speechDetectedRef.current) {
                      console.log('[VAD] Auto-stopping recording after natural pause');
                      setMicStatusText('⚡ Processing your speech...');
                      stopRecording();
                    }
                  }, 1200);
                }
              }
            }

            animFrameRef.current = requestAnimationFrame(monitorVolume);
          };
          monitorVolume();
        }

        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          try { await audioContextRef.current.resume(); } catch (e) {}
        }
      }

      return stream;
    } catch (err) {
      console.error('Microphone access failed:', err);
      setMicError('Microphone blocked. Please allow microphone access in your browser address bar.');
      return null;
    }
  };

  // Start MediaRecorder or Browser SpeechRecognition
  const startRecording = async () => {
    if (!isCallActiveRef.current || isAiSpeakingRef.current) return;
    if (isRecordingRef.current || isTranscribingRef.current) return;

    if (useBrowserSTTRef.current) {
      console.log('[STT] Browser SpeechRecognition active mode');
      startBrowserSpeechRecognition();
      return;
    }

    setMicError(null);
    console.log('[STT] startRecording called');

    // Reset VAD state for fresh recording
    speechDetectedRef.current = false;
    recordingStartTimeRef.current = Date.now();
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    const stream = await ensureAudioStream();
    if (!stream) {
      console.error('[STT] No audio stream available, attempting browser speech recognition');
      useBrowserSTTRef.current = true;
      startBrowserSpeechRecognition();
      return;
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try { await audioContextRef.current.resume(); } catch (e) {}
    }

    try {
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      console.log('[STT] Selected MIME type:', mimeType);

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        console.log('[STT] Recording stopped. Chunks collected:', audioChunksRef.current.length);
        setIsRecording(false);
        isRecordingRef.current = false;
        if (maxRecordingTimerRef.current) {
          clearTimeout(maxRecordingTimerRef.current);
          maxRecordingTimerRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log('[STT] Audio blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);

        if (audioBlob.size > 1800 && speechDetectedRef.current) {
          await transcribeWithWhisper(audioBlob);
        } else {
          console.warn('[STT] Audio blob too small or no speech detected, re-listening...');
          setMicStatusText('Listening...');
          if (isCallActiveRef.current && !isAiSpeakingRef.current && !isMuted && !micError) {
            setTimeout(() => {
              if (isCallActiveRef.current && !isAiSpeakingRef.current && !isRecordingRef.current && !micError) {
                startAutoListening();
              }
            }, 800);
          }
        }
      };

      recorder.onerror = (event) => {
        console.error('[STT] MediaRecorder error event:', event.error);
        setIsRecording(false);
        isRecordingRef.current = false;
        useBrowserSTTRef.current = false;
        setMicError('Microphone recorder error. Please check permissions.');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // 250ms timeslices for reliable chunk collection
      setIsRecording(true);
      isRecordingRef.current = true;
      setMicStatusText('🎙️ Listening... speak naturally');
      console.log('[STT] Recording started. Auto-stops on silence after speech detected.');

      // Safety timeout: auto-stop after 7.5 seconds of speaking to avoid getting stuck
      maxRecordingTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log('[VAD] Max recording duration reached (7.5s), auto-stopping');
          stopRecording();
        }
      }, 7500);

    } catch (err) {
      console.error('[STT] MediaRecorder error, falling back to browser recognition:', err);
      setIsRecording(false);
      isRecordingRef.current = false;
      useBrowserSTTRef.current = true;
      startBrowserSpeechRecognition();
    }
  };

  // Stop recording & trigger Whisper transcription
  const stopRecording = () => {
    console.log('[STT] stopRecording called. Recorder state:', mediaRecorderRef.current?.state);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }

    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.stop(); } catch (e) {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        console.log('[STT] MediaRecorder.stop() called successfully');
      } catch (e) {
        console.error('[STT] Error stopping MediaRecorder:', e);
      }
    }
    setIsRecording(false);
    isRecordingRef.current = false;
  };

  // Send audio Blob to Backend Whisper STT
  const transcribeWithWhisper = async (blob) => {
    setIsTranscribing(true);
    setMicStatusText('⚡ Transcribing audio with Whisper AI...');
    console.log('[STT] Sending audio to transcription API. Blob size:', blob.size, 'type:', blob.type);

    try {
      const dataUrl = await blobToBase64(blob);
      const base64Audio = dataUrl.split(';base64,').pop();
      const format = blob.type.includes('mp4') ? 'mp4' : 'webm';

      const res = await api.transcribeAudio({
        audio: base64Audio,
        format: format,
      });

      console.log('[STT] Transcription response:', JSON.stringify(res));

      // Handle environments without backend torch (e.g. Render Free)
      if (res.error === 'NO_BACKEND_STT' || res.error?.includes('torch') || res.error?.includes('No module named') || res.error?.includes('Command failed')) {
        console.warn('[STT] Backend STT unavailable on server:', res.message || res.error);
        setIsTranscribing(false);

        // Detect Brave or browser that blocks Web Speech API
        const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function') ||
                        navigator.userAgent.includes('Brave');
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition && !isBrave) {
          useBrowserSTTRef.current = true;
          setMicStatusText('🎙️ Switched to Browser Voice Recognition');
          startBrowserSpeechRecognition();
        } else {
          useBrowserSTTRef.current = false;
          setMicError(
            isBrave
              ? 'Voice recognition on Render requires a free Groq API key (Brave blocks browser speech). Please add a free GROQ_API_KEY in AI Settings or use Chrome / Edge.'
              : 'Voice recognition on Render requires a cloud STT key. Add a free GROQ_API_KEY in AI Settings or type below.'
          );
        }
        return;
      }

      const transcribedText = res.text ? res.text.trim() : '';
      setIsTranscribing(false);

      if (transcribedText) {
        setMicStatusText(`✓ Recognized: "${transcribedText}"`);
        handleUserSpeech(transcribedText);
      } else {
        setMicStatusText('Listening...');
        if (res.error) {
          console.error('[STT] Whisper error:', res.error);
        }
        if (isCallActiveRef.current && !isAiSpeakingRef.current && !isMuted && !micError) {
          setTimeout(() => {
            if (isCallActiveRef.current && !isAiSpeakingRef.current && !isRecordingRef.current && !micError) {
              startAutoListening();
            }
          }, 800);
        }
      }
    } catch (err) {
      console.warn('[STT] Backend transcription failed:', err.message);
      setIsTranscribing(false);
      const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function') ||
                      navigator.userAgent.includes('Brave');
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition && !isBrave) {
        useBrowserSTTRef.current = true;
        startBrowserSpeechRecognition();
      } else {
        useBrowserSTTRef.current = false;
        setMicError('Audio transcription failed. You can type below or add a free GROQ_API_KEY in AI Settings.');
      }
    }
  };

  // Auto-listen trigger after Neerja finishes speaking — starts recording automatically
  const startAutoListening = () => {
    isAiSpeakingRef.current = false;
    setIsAiSpeaking(false);
    if (!isCallActiveRef.current || isMuted || sessionTypeRef.current !== 'call' || micError) return;
    if (isRecordingRef.current || isTranscribingRef.current) return;
    // Brief pause before auto-starting mic (snappy and natural)
    setTimeout(() => {
      if (!isCallActiveRef.current || isAiSpeakingRef.current || isMuted || sessionTypeRef.current !== 'call' || micError) return;
      if (isRecordingRef.current || isTranscribingRef.current) return;
      setMicStatusText('🎙️ Listening... speak naturally');
      startRecording();
    }, 200);
  };

  // Start Call Handler (Voice)
  const startCall = async () => {
    setSessionType('call');
    sessionTypeRef.current = 'call';
    setCallEndedSummary(null);
    setMicError(null);
    setIsCallActive(true);
    isCallActiveRef.current = true;
    setCallDuration(0);

    // Prompt for mic permission
    await ensureAudioStream();

    let greeting = "Hi, you've reached DentalFlow Downtown. I'm Neerja — the AI receptionist for the dental team, and this call's recorded. Just ask me anything and I'll get it sorted. How can I help?";
    try {
      const settings = await api.getAiSettings();
      if (settings?.greeting_script) {
        greeting = settings.greeting_script.replace('{practice_name}', 'DentalFlow Downtown');
      }
    } catch (e) {}

    const initialAiMessage = {
      role: 'ai',
      text: greeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([initialAiMessage]);
    setContext({
      caller_name: '',
      caller_phone: '',
      caller_email: '',
      intent: 'general_inquiry',
      booking_step: 'idle',
    });

    speakText(greeting);
  };

  // Start Chat Handler (Text)
  const startChat = async () => {
    setSessionType('chat');
    sessionTypeRef.current = 'chat';
    setCallEndedSummary(null);
    setMicError(null);
    setIsCallActive(true);
    isCallActiveRef.current = true;
    setCallDuration(0);

    let greeting = "Hi! You're chatting with Neerja, the AI receptionist for DentalFlow Downtown. How can I help you today?";
    try {
      const settings = await api.getAiSettings();
      if (settings?.greeting_script) {
        greeting = settings.greeting_script.replace('{practice_name}', 'DentalFlow Downtown');
      }
    } catch (e) {}

    const initialAiMessage = {
      role: 'ai',
      text: greeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([initialAiMessage]);
    setContext({
      caller_name: '',
      caller_phone: '',
      caller_email: '',
      intent: 'general_inquiry',
      booking_step: 'idle',
    });
  };

  // End Call Handler
  const endCall = async () => {
    isCallActiveRef.current = false;
    isAiSpeakingRef.current = false;
    isRecordingRef.current = false;
    cleanupAudio();
    setIsCallActive(false);
    setIsAiSpeaking(false);

    const currentDuration = callDuration;
    const allMessages = messagesRef.current;
    const currentContext = contextRef.current;
    const currentSessionType = sessionTypeRef.current;

    if (allMessages.length <= 1 && currentDuration < 2) return;

    const transcriptFormatted = allMessages.map((m) => ({
      role: m.role === 'ai' ? 'ai' : 'caller',
      text: m.text,
    }));

    const detectedIntent = currentContext.intent || (currentContext.booking_completed ? 'appointment_booking' : 'general_inquiry');
    let sentiment = 'neutral';
    if (currentContext.booking_completed) sentiment = 'positive';
    else if (detectedIntent === 'clinical_emergency') sentiment = 'urgent';
    else if (detectedIntent === 'patient_complaint') sentiment = 'negative';

    const callerName = currentContext.caller_name || 'Patient';
    const spelledName = currentContext.caller_name_spelled || callerName.toUpperCase().split('').join('-').replace(/ /g, '  ');

    let summaryText = `AI ${currentSessionType === 'call' ? 'voice call' : 'chat session'} with ${callerName} (${formatTimer(currentDuration)}). `;
    if (currentContext.booking_completed) {
      summaryText += `Successfully booked appointment with ${currentContext.selected_practitioner_name || 'Dr. Lindsay Wren'} for ${currentContext.selected_time_display || 'Wednesday at 5:00 PM'}.`;
    } else if (detectedIntent === 'clinical_emergency') {
      summaryText += `URGENT: Patient reported acute clinical emergency. Flagged critical escalation alert for clinician triage.`;
    } else if (detectedIntent === 'patient_complaint') {
      summaryText += `Patient dispute escalated to practice manager for review and callback.`;
    } else if (detectedIntent === 'pricing_inquiry') {
      summaryText += `Inquired about dental treatment fees. Full pricing details provided.`;
    } else {
      summaryText += `General inquiry regarding practice hours, address, and dental services.`;
    }

    const payload = {
      caller_name: callerName,
      caller_name_spelled: spelledName,
      caller_phone: currentContext.caller_phone || '555-0106',
      caller_email: currentContext.caller_email || 'patient@example.com',
      call_type: currentSessionType === 'call' ? 'inbound_ai' : 'web_chat',
      is_after_hours: 1,
      duration_seconds: currentDuration,
      intent: detectedIntent,
      ai_summary: summaryText,
      transcript: JSON.stringify(transcriptFormatted),
      sentiment: sentiment,
      status: currentContext.booking_completed ? 'resolved' : (detectedIntent === 'clinical_emergency' || detectedIntent === 'patient_complaint' ? 'escalated' : 'open'),
      is_won_back: currentContext.booking_completed ? 1 : 0,
    };

    try {
      const res = await api.createCallLog(payload);
      setCallEndedSummary({
        id: res.id,
        caller: callerName,
        duration: formatTimer(currentDuration),
        intent: detectedIntent,
        summary: summaryText,
      });

      if (onCallEnded) onCallEnded();
    } catch (err) {
      console.error('Failed to log call summary:', err);
    }
  };

  // Process User Speech
  const handleUserSpeech = async (text) => {
    if (!text || !isCallActiveRef.current) return;

    if (sessionTypeRef.current === 'call') {
      stopRecording();
    }

    const userMessage = {
      role: 'caller',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await api.simulateAiChat({
        message: text,
        history: messagesRef.current.map((m) => ({ role: m.role, content: m.text })),
        context: contextRef.current,
      });

      if (res.context) {
        setContext(res.context);
      }

      const aiMessage = {
        role: 'ai',
        text: res.reply,
        action: res.action,
        action_label: res.action_label,
        appointment: res.appointment,
        alert: res.alert,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMessage]);
      if (sessionTypeRef.current === 'call') {
        speakText(res.reply);
      }
    } catch (err) {
      console.error('AI chat simulation failed:', err);
      const fallbackReply = "I'm right here with you! Could you repeat that for me?";
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: fallbackReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      if (sessionTypeRef.current === 'call') {
        speakText(fallbackReply);
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !isCallActive) return;
    const msg = inputVal.trim();
    setInputVal('');
    handleUserSpeech(msg);
  };

  // Floating button trigger
  if (mode === 'floating' && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-ink-900 to-ink-800 text-white rounded-full shadow-xl hover:shadow-2xl border border-teal-500/30 hover:scale-105 transition-all group"
      >
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-teal-500/20 text-teal-400">
          <Bot size={18} className="animate-pulse" />
          <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-teal-400 rounded-full animate-ping" />
        </div>
        <div className="text-left">
          <p className="text-xs font-semibold tracking-wide">Test AI Agent</p>
          <p className="text-[10px] text-teal-300/80">Talk with Neerja (Neural Voice + STT)</p>
        </div>
      </button>
    );
  }

  return (
    <div
      className={
        mode === 'floating'
          ? 'fixed bottom-6 right-6 z-50 w-[460px] max-w-[calc(100vw-2rem)] h-[680px] max-h-[calc(100vh-4rem)] flex flex-col bg-[#0F172A] text-white rounded-2xl shadow-2xl border border-slate-700/60 overflow-hidden font-sans'
          : 'w-full flex flex-col bg-[#0F172A] text-white rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden font-sans'
      }
    >
      {/* Top Header Bar */}
      <div className="bg-[#1E293B] px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-teal-600/30 border border-teal-500/40 flex items-center justify-center text-teal-400 font-semibold text-xs">
              N
            </div>
            {isCallActive && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[#1E293B]" />
            )}
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-slate-100">Neerja</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">

          {mode === 'floating' && (
            <button
              onClick={() => {
                if (isCallActive) endCall();
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700/50 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Live Call / Chat Banner */}
      {isCallActive ? (
        <div className="bg-gradient-to-r from-teal-950/80 via-slate-900 to-ink-950 px-4 py-2.5 border-b border-teal-500/20 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${sessionType === 'call' ? 'bg-red-400' : 'bg-blue-400'} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${sessionType === 'call' ? 'bg-red-500' : 'bg-blue-500'}`} />
            </span>
            <span className="text-slate-200 font-medium">
              {sessionType === 'call' ? 'Live voice call' : 'Live text chat'} · {context.caller_name || 'Patient'}
            </span>
          </div>

          {/* Waveform Audio Visualizer for voice, or simple timer for chat */}
          <div className="flex items-center gap-3">
            {sessionType === 'call' && (
              <div className="flex items-center gap-0.5 h-4">
                {[4, 8, 14, 18, 12, 16, 10, 20, 14, 6].map((baseH, i) => {
                  const isWaveActive = isAiSpeaking || (isRecording && micVolume > 3);
                  return (
                    <div
                      key={i}
                      className={`w-0.5 rounded-full transition-all duration-150 ${
                        isAiSpeaking
                          ? 'bg-teal-400 animate-pulse'
                          : isRecording
                          ? 'bg-emerald-400 animate-bounce'
                          : 'bg-slate-600'
                      }`}
                      style={{
                        height: isWaveActive ? `${baseH}px` : '4px',
                      }}
                    />
                  );
                })}
              </div>
            )}
            <span className="font-mono text-teal-300 font-semibold text-xs">{formatTimer(callDuration)}</span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>AI Receptionist Simulator Ready</span>
          </div>
          <span className="text-slate-400 text-[10px]">Voice Call & Text Chat</span>
        </div>
      )}

      {/* Mic Warning Banner */}
      {micError && sessionType === 'call' && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-3.5 py-2 text-xs text-amber-200 flex items-start gap-2">
          <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">
            <p className="font-medium text-amber-300">Microphone Notice</p>
            <p className="text-amber-200/80 mt-0.5">{micError}</p>
          </div>
          <button
            onClick={() => {
              setMicError(null);
              useBrowserSTTRef.current = false;
              startRecording();
            }}
            className="px-2 py-0.5 bg-amber-800/80 hover:bg-amber-700 text-amber-100 rounded text-[10px] font-medium shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Transcript / Conversation Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#0B132B]/50 scroll-smooth">
        {!isCallActive && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-5 text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shadow-inner">
              <Bot size={26} className="animate-pulse" />
            </div>
            <div className="max-w-xs space-y-1">
              <h3 className="text-base font-semibold text-white">Test Neerja AI Receptionist</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Experience real-time patient interactions. Choose your preferred testing method below:
              </p>
            </div>

            {/* Two Options: Start a Call vs Start a Chat */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm pt-1">
              <button
                type="button"
                onClick={startCall}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-b from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white shadow-lg shadow-teal-950/40 hover:scale-[1.02] transition-all group border border-teal-400/20"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Phone size={18} className="text-teal-200" />
                </div>
                <span className="font-semibold text-xs tracking-wide">Start a Call</span>
                <span className="text-[10px] text-teal-200/70 mt-0.5">Hands-free voice</span>
              </button>

              <button
                type="button"
                onClick={startChat}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-white shadow-lg border border-slate-700 hover:border-slate-600 hover:scale-[1.02] transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <MessageSquare size={18} className="text-blue-300" />
                </div>
                <span className="font-semibold text-xs tracking-wide">Start a Chat</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Type messages</span>
              </button>
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === 'ai' ? 'items-start' : 'items-end'} space-y-1.5`}
          >
            <div className="flex items-end gap-2 max-w-[88%]">
              {msg.role === 'ai' && (
                <div className="w-6 h-6 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center text-teal-300 text-[10px] font-bold shrink-0 mb-1">
                  N
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'ai'
                    ? 'bg-[#1E293B] text-slate-100 border border-slate-700/50 rounded-bl-sm'
                    : 'bg-teal-600 text-white rounded-br-sm shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[10px] opacity-60 mb-1">
                  <span className="font-semibold">{msg.role === 'ai' ? 'Neerja' : 'You (Caller)'}</span>
                  <span>{msg.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>

            {/* In-transcript action chips */}
            {msg.action === 'check_availability' && (
              <div className="ml-8 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-teal-500/30 text-teal-300 text-[11px] font-mono shadow-sm">
                <Calendar size={12} className="text-teal-400" />
                <span>{msg.action_label || 'check_availability → 6 evening slots - Next Wednesday'}</span>
              </div>
            )}

            {msg.action === 'appointment_booked' && msg.appointment && (
              <div className="ml-8 max-w-[92%] rounded-xl bg-teal-950/80 border border-teal-500/40 p-3.5 space-y-2 text-xs shadow-md">
                <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
                  <span className="text-teal-300 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-teal-400" /> Appointment Confirmed
                  </span>
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded font-mono">
                    #APT-{msg.appointment.appointment_id}
                  </span>
                </div>
                <div className="text-slate-300 space-y-0.5 text-[11px]">
                  <p className="font-medium text-white">{msg.appointment.patient_name} · {msg.appointment.reason}</p>
                  <p>{msg.appointment.start_time.replace('T', ' ')} with <strong className="text-teal-200">{msg.appointment.practitioner}</strong></p>
                </div>
                <div className="flex gap-2 pt-1">
                  <span className="text-[10px] bg-slate-800/80 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">WhatsApp sent</span>
                  <span className="text-[10px] bg-slate-800/80 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">SMS sent</span>
                  <span className="text-[10px] bg-slate-800/80 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">Email sent</span>
                </div>
              </div>
            )}

            {msg.action === 'emergency_escalated' && (
              <div className="ml-8 max-w-[92%] rounded-xl bg-clay-950/80 border border-red-500/40 p-3 space-y-1.5 text-xs text-red-200 shadow-md">
                <div className="flex items-center gap-1.5 font-semibold text-red-400">
                  <AlertTriangle size={15} /> Clinical Emergency Escalated
                </div>
                <p className="text-[11px] text-slate-300">
                  Critical triage alert generated for on-call dentist callback. Patient advised on emergency hospital red flags.
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Live Recording / Transcribing Indicator */}
        {isRecording && (
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-sm px-4 py-2.5 bg-red-950/80 border border-red-500/60 text-red-100 text-xs flex items-center gap-2 animate-pulse shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span>Listening... speak naturally (auto-stops on silence)</span>
            </div>
          </div>
        )}

        {isTranscribing && (
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-sm px-4 py-2.5 bg-teal-950/80 border border-teal-500/60 text-teal-100 text-xs flex items-center gap-2 shadow-lg">
              <Loader2 size={14} className="animate-spin text-teal-400" />
              <span>Transcribing with Whisper AI...</span>
            </div>
          </div>
        )}

        {/* Call Ended Summary Banner */}
        {callEndedSummary && (
          <div className="rounded-xl bg-slate-800/90 border border-slate-700 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-teal-400 font-semibold border-b border-slate-700 pb-1.5">
              <span>Call Logged to Inbox & Dashboard</span>
              <span className="text-slate-400 font-normal">Duration: {callEndedSummary.duration}</span>
            </div>
            <p className="text-slate-300 text-[11px]">{callEndedSummary.summary}</p>
            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
              <span>Caller: <strong>{callEndedSummary.caller}</strong></span>
              <span className="uppercase tracking-wider font-mono text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-500/30">
                {callEndedSummary.intent.replace('_', ' ')}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Spoken Phrases */}
      {isCallActive && (
        <div className="px-3 py-1.5 bg-[#0e1626] border-t border-slate-800 flex gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-500 shrink-0 self-center text-[10px]">Try saying:</span>
          {[
            "I'd like to book a check-up please",
            "Wednesday 5pm with Dr. Wren works",
            "My name is Peter Strain",
            "How much is Invisalign?",
            "I have severe tooth pain and swelling!",
          ].map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleUserSpeech(prompt)}
              className="px-2.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap border border-slate-700/60 text-[10px] transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Controls & Input Area */}
      <div className="bg-[#1E293B] p-3 border-t border-slate-700/50 space-y-2.5">
        {isCallActive ? (
          sessionType === 'call' ? (
            /* Voice Call Mode — Hands-Free, No Manual Buttons */
            <div className="space-y-2.5">
              {/* Live Call Turn-Taking Status Bar */}
              <div className="flex items-center justify-between text-[11px] bg-slate-900/70 rounded-xl py-2 px-3 border border-slate-700/60 shadow-inner">
                <div className="flex items-center gap-2">
                  {isAiSpeaking ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                      <span className="text-teal-300 font-medium">Neerja is speaking...</span>
                    </>
                  ) : isRecording ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300 font-medium">Listening to you... (speak naturally)</span>
                    </>
                  ) : isTranscribing ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-teal-400" />
                      <span className="text-teal-300 font-medium">Transcribing speech with Whisper...</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-amber-300 font-medium">Microphone Muted</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-slate-300">Call active · Ready for your voice</span>
                    </>
                  )}
                </div>

                {isRecording && !isMuted ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                      <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full transition-all duration-100"
                          style={{ width: `${Math.min(100, micVolume * 2)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">{micVolume}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => stopRecording()}
                      className="px-2 py-0.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-medium transition-colors shadow-sm cursor-pointer"
                      title="Click when done speaking to send immediately"
                    >
                      Send now
                    </button>
                  </div>
                ) : !isAiSpeaking && !isTranscribing && !isMuted ? (
                  <button
                    type="button"
                    onClick={() => startRecording()}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    Tap to speak
                  </button>
                ) : null}
              </div>

              {/* Optional Collapsible Text Input for noisy rooms */}
              {showTypeInput && (
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="Type a message instead..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="submit"
                    disabled={!inputVal.trim()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center"
                  >
                    <Send size={13} />
                  </button>
                </form>
              )}

              {/* Bottom Call Control Buttons */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-2">
                  {/* Mute Mic Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isMuted;
                      setIsMuted(next);
                      if (next) {
                        stopRecording();
                        setMicStatusText('Microphone muted');
                      } else {
                        startAutoListening();
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs transition-colors flex items-center gap-1.5 ${
                      isMuted
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                    <span className="text-[11px]">{isMuted ? 'Muted' : 'Mute'}</span>
                  </button>

                  {/* Speaker Voice Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isAudioMuted;
                      setIsAudioMuted(next);
                      if (next) {
                        if (elevenAudioRef.current) {
                          try { elevenAudioRef.current.pause(); } catch(e) {}
                          elevenAudioRef.current = null;
                        }
                        if (window.speechSynthesis) window.speechSynthesis.cancel();
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs transition-colors flex items-center gap-1.5 ${
                      isAudioMuted
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={isAudioMuted ? "Unmute Voice" : "Mute Voice"}
                  >
                    {isAudioMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    <span className="text-[11px]">{isAudioMuted ? 'Speaker Off' : 'Speaker On'}</span>
                  </button>

                  {/* Text Fallback Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowTypeInput(!showTypeInput)}
                    className={`px-2 py-1.5 rounded-xl border text-[11px] transition-colors ${
                      showTypeInput
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                    title="Toggle keyboard typing"
                  >
                    Keyboard
                  </button>
                </div>

                {/* End Call Button */}
                <button
                  type="button"
                  onClick={endCall}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs shadow-lg shadow-red-950/40 hover:scale-105 transition-all"
                >
                  <PhoneOff size={14} /> End Call
                </button>
              </div>
            </div>
          ) : (
            /* Text Chat Mode */
            <div className="space-y-2">
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Type your message to Neerja..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!inputVal.trim()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
                >
                  <span>Send</span>
                  <Send size={13} />
                </button>
              </form>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] text-slate-400">Interactive chat mode</span>
                <button
                  type="button"
                  onClick={endCall}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-medium text-xs transition-colors"
                >
                  <PhoneOff size={12} /> End Chat
                </button>
              </div>
            </div>
          )
        ) : (
          /* Idle Mode — Two Options: Start Call or Start Chat */
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span>Ready to start session</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startChat}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-all hover:scale-105"
              >
                <MessageSquare size={13} className="text-blue-400" />
                <span>Start a Chat</span>
              </button>
              <button
                type="button"
                onClick={startCall}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs shadow-md shadow-teal-950/40 hover:scale-105 transition-all"
              >
                <Phone size={13} />
                <span>Start a Call</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
