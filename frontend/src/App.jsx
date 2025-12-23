import { useState, useEffect, useRef } from 'react'
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk"
import axios from "axios"
import './App.css'

class SpeechService {
  constructor(callbacks) {
    this.callbacks = callbacks || {};
    this.conversationTranscriber = null;
    this.audioConfig = null;
    this.speechConfig = null;
    this.isRunning = false;
  }

  async getToken() {
    try {
      const response = await axios.get("/api/token");
      return { token: response.data.token, region: response.data.region };
    } catch (error) {
      throw new Error(`获取token失败: ${error.response?.data?.detail || error.message}`);
    }
  }

  async start() {
    if (this.isRunning) return;

    try {
      const { token, region } = await this.getToken();
      const endpoint = `wss://${region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1`;

      this.speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);


      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_Endpoint,
        endpoint
      );
      this.speechConfig.authorizationToken = token;
      this.speechConfig.speechRecognitionLanguage = "zh-CN";
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
        "2000"
      );

      this.audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      this.conversationTranscriber = new SpeechSDK.ConversationTranscriber(
        this.speechConfig,
        this.audioConfig
      );

      this.setupEventHandlers();
      this.conversationTranscriber.startTranscribingAsync(
        () => {
          this.isRunning = true;
          this.callbacks.onSessionStarted?.();
        },
        (error) => {
          this.isRunning = false;
          this.callbacks.onError?.(`启动失败: ${error}`);
        }
      );
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  setupEventHandlers() {
    this.conversationTranscriber.transcribing = (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech && e.result.text) {
        this.callbacks.onTranscribing?.(e.result.text, this.extractSpeakerId(e.result));
      }
    };

    this.conversationTranscriber.transcribed = (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
        this.callbacks.onTranscribed?.(e.result.text, this.extractSpeakerId(e.result));
      }
    };

    this.conversationTranscriber.canceled = (s, e) => {
      this.isRunning = false;
      let errorMsg = `识别错误: ${e.errorDetails}`;
      if (e.errorDetails?.includes("StatusCode: 1006")) {
        errorMsg += "\n提示: WebSocket 连接失败，请检查网络连接、Token有效性和防火墙设置";
      }
      this.callbacks.onError?.(errorMsg);
    };

    this.conversationTranscriber.sessionStopped = () => {
      this.isRunning = false;
      this.callbacks.onSessionStopped?.();
    };
  }

  extractSpeakerId(result) {
    if (result.userId || result.speakerId) {
      return result.userId || result.speakerId;
    }
    try {
      if (result.json) {
        const json = JSON.parse(result.json);
        return json.SpeakerId || json.UserId || json.speakerId || json.userId || null;
      }
      if (result.privResult) {
        const priv = result.privResult;
        return priv.SpeakerId || priv.speakerId || priv.UserId || priv.userId || null;
      }
    } catch {}
    return null;
  }

  stop() {
    if (this.conversationTranscriber && this.isRunning) {
      this.conversationTranscriber.stopTranscribingAsync(() => {
        this.isRunning = false;
      });
    }
    [this.conversationTranscriber, this.audioConfig, this.speechConfig].forEach(
      (resource) => resource?.close()
    );
    this.conversationTranscriber = this.audioConfig = this.speechConfig = null;
  }
}

function App() {
  const [isListening, setIsListening] = useState(false)
  const [transcriptions, setTranscriptions] = useState([])
  const [error, setError] = useState(null)
  const [speakers, setSpeakers] = useState(new Map())
  const speechServiceRef = useRef(null)
  const speakersRef = useRef(new Map())

  useEffect(() => {
    speakersRef.current = speakers
  }, [speakers])

  useEffect(() => {
    speechServiceRef.current = new SpeechService({
      onTranscribed: (text, speakerId) => {
        setSpeakers(prev => {
          const newSpeakers = new Map(prev)
          if (speakerId && !newSpeakers.has(speakerId)) {
            newSpeakers.set(speakerId, newSpeakers.size + 1)
          }
          speakersRef.current = newSpeakers
          const speakerNum = newSpeakers.get(speakerId)
          const speakerName = speakerNum ? `说话人-${speakerNum}` : 'Unknown'
          
          setTranscriptions(prev => [...prev, {
            id: Date.now(),
            text,
            speakerId,
            speakerName,
            timestamp: new Date().toLocaleTimeString('zh-CN')
          }])
          return newSpeakers
        })
      },
      onError: (errorMsg) => {
        setError(errorMsg)
        setIsListening(false)
      }
    })

    return () => speechServiceRef.current?.stop()
  }, [])

  const handleStart = async () => {
    try {
      setError(null)
      setIsListening(true)
      await speechServiceRef.current.start()
    } catch (err) {
      setError(err.message || '启动失败')
      setIsListening(false)
    }
  }

  const handleStop = () => {
    speechServiceRef.current.stop()
    setIsListening(false)
  }

  const handleClear = () => {
    setTranscriptions([])
    setSpeakers(new Map())
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🎤 Azure Speech - 说话人分离</h1>
          <p className="subtitle">实时语音识别与说话人识别</p>
        </header>

        <div className="controls">
          {!isListening ? (
            <button className="btn btn-start" onClick={handleStart}>
              ▶️ 开始识别
            </button>
          ) : (
            <button className="btn btn-stop" onClick={handleStop}>
              ⏹️ 停止识别
            </button>
          )}
          <button className="btn btn-clear" onClick={handleClear} disabled={transcriptions.length === 0}>
            🗑️ 清空记录
          </button>
        </div>

        {error && (
          <div className="error-message">
            ❌ 错误: {error}
          </div>
        )}

        {isListening && (
          <div className="listening-indicator">
            <div className="pulse"></div>
            <span>正在监听中...</span>
          </div>
        )}

        <div className="transcriptions">
          <h2>转录记录</h2>
          {transcriptions.length === 0 ? (
            <div className="empty-state">
              <p>暂无转录记录</p>
              <p className="hint">点击"开始识别"按钮开始语音识别</p>
            </div>
          ) : (
            <div className="transcription-list">
              {transcriptions.map((item) => (
                <div key={item.id} className="transcription-item">
                  <div className="transcription-header">
                    <span className="speaker-badge">{item.speakerName}</span>
                    <span className="timestamp">{item.timestamp}</span>
                  </div>
                  <div className="transcription-text">{item.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {speakers.size > 0 && (
          <div className="speakers-info">
            <h3>已识别说话人: {speakers.size} 个</h3>
            <div className="speaker-list">
              {Array.from(speakers.entries()).map(([id, num]) => (
                <span key={id} className="speaker-tag">
                  说话人-{num}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

