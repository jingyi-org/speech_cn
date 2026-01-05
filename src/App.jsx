import { useState, useEffect, useRef } from "react";
import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import axios from "axios";
import "./App.css";

const TOKEN_REFRESH_INTERVAL = 8 * 60 * 1000;
// Azure Speech Service 会话超时时间（20分钟 = 1200000毫秒）
// 在19分钟时主动重启会话，避免超时
const SESSION_TIMEOUT_MS = 19 * 60 * 1000; // 19分钟

class SpeechService {
  constructor(callbacks) {
    this.callbacks = callbacks || {};

    /** @type {speechsdk.ConversationTranscriber | null} */
    this.conversationTranscriber = null;

    this.audioConfig = null;

    /** @type {speechsdk.SpeechConfig | null} */
    this.speechConfig = null;

    this.isRunning = false;
    this.tokenRefreshInterval = null;
    this.sessionRestartTimer = null;
    this.sessionStartTime = null;
    this.autoReconnectEnabled = false; // 是否启用自动重连
  }

  async getAuthorizationToken() {
    try {
      console.time("getAuthorizationToken");
      const response = await axios.get(
        "https://studemo.net/api/speech/vue-token"
      );
      console.timeEnd("getAuthorizationToken", response);
      return { token: response.data.token, region: response.data.region };
    } catch (error) {
      throw new Error(
        `获取token失败: ${error.response?.data?.detail || error.message}`
      );
    }
  }

  async refreshToken() {
    if (this.conversationTranscriber && this.speechConfig) {
      try {
        const { token } = await this.getAuthorizationToken();
        this.speechConfig.authorizationToken = token;

        this.callbacks.onTokenRefreshed?.();
      } catch (error) {
        this.callbacks.onError?.(`刷新 token 失败: ${error.message}`);
      }
    }
  }

  startTokenRefresh() {
    this.stopTokenRefresh();

    this.tokenRefreshInterval = setInterval(() => {
      this.refreshToken();
    }, TOKEN_REFRESH_INTERVAL);
  }

  stopTokenRefresh() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }

  startSessionRestartTimer() {
    this.stopSessionRestartTimer();

    // 在19分钟时主动重启会话
    this.sessionRestartTimer = setTimeout(() => {
      if (this.isRunning && this.autoReconnectEnabled) {
        console.log("会话即将超时，主动重启会话...");
        this.restartSession("会话即将超时（19分钟），主动重启");
      }
    }, SESSION_TIMEOUT_MS);
  }

  stopSessionRestartTimer() {
    if (this.sessionRestartTimer) {
      clearTimeout(this.sessionRestartTimer);
      this.sessionRestartTimer = null;
    }
  }

  async restartSession(reason = "主动重启") {
    if (!this.isRunning || !this.autoReconnectEnabled) {
      return;
    }

    try {
      // 通知界面：开始重启
      this.callbacks.onSessionRestarting?.(reason);

      // 先停止当前会话
      const wasRunning = this.isRunning;
      this.isRunning = false; // 防止事件处理器触发重连

      // 停止定时器
      this.stopTokenRefresh();
      this.stopSessionRestartTimer();

      if (this.conversationTranscriber) {
        await new Promise((resolve) => {
          if (this.conversationTranscriber) {
            this.conversationTranscriber.stopTranscribingAsync(() => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      }

      // 清理资源
      [
        this.conversationTranscriber,
        this.audioConfig,
        this.speechConfig,
      ].forEach((resource) => resource?.close());

      // 重置资源引用
      this.conversationTranscriber = null;
      this.audioConfig = null;
      // 保留 speechConfig，因为可以重用（只需要更新 token）

      // 重新启动会话
      if (wasRunning) {
        await this.start();
        // 通知界面：重启成功
        this.callbacks.onSessionRestarted?.();
      }
    } catch (error) {
      console.error("重启会话失败:", error);
      this.callbacks.onSessionRestartFailed?.(error.message);
      this.callbacks.onError?.(`重启会话失败: ${error.message}`);
    }
  }

  async start() {
    if (this.isRunning) return;

    try {
      const { token, region } = await this.getAuthorizationToken();

      const endpoint = `wss://${region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1`;

      this.speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(
        token,
        region
      );

      this.speechConfig.setProperty(
        speechsdk.PropertyId.SpeechServiceConnection_Endpoint,
        endpoint
      );
      this.speechConfig.authorizationToken = token;
      this.speechConfig.speechRecognitionLanguage = "zh-CN";
      this.speechConfig.setProperty(
        speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
        "2000"
      );

      this.speechConfig.setProperty(
        speechsdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
        "false"
      );

      this.speechConfig.setProperty(
        speechsdk.PropertyId.Conversation_Initial_Silence_Timeout,
        "0"
      );

      // const audioFormat = speechsdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
      // const pushStream = speechsdk.AudioInputStream.createPushStream(audioFormat);
      // this.audioConfig = speechsdk.AudioConfig.fromStreamInput(pushStream);

      this.audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();

      this.conversationTranscriber = new speechsdk.ConversationTranscriber(
        this.speechConfig,
        this.audioConfig
      );

      const phraseListGrammar = speechsdk.PhraseListGrammar.fromRecognizer(
        this.conversationTranscriber
      );
      phraseListGrammar.addPhrases(["美的", "格力"]);

      this.setupEventHandlers();
      this.conversationTranscriber.startTranscribingAsync(
        () => {
          this.isRunning = true;
          this.sessionStartTime = Date.now();
          this.callbacks.onSessionStarted?.();
          // 启动定时器，每隔10秒刷新 token
          this.startTokenRefresh();
          // 启动会话重启定时器（在19分钟时主动重启）
          if (this.autoReconnectEnabled) {
            this.startSessionRestartTimer();
          }
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
      if (
        e.result.reason === speechsdk.ResultReason.RecognizingSpeech &&
        e.result.text
      ) {
        this.callbacks.onTranscribing?.(
          e.result.text,
          this.extractSpeakerId(e.result)
        );
      }
    };

    this.conversationTranscriber.transcribed = (s, e) => {
      console.log({ method: "transcribed", s, e });
      if (
        e.result.reason === speechsdk.ResultReason.RecognizedSpeech &&
        e.result.text
      ) {
        this.callbacks.onTranscribed?.(
          e.result.text,
          this.extractSpeakerId(e.result)
        );
      }
    };

    this.conversationTranscriber.canceled = (s, e) => {
      console.log({ method: "canceled", s, e });
      const wasRunning = this.isRunning;
      this.isRunning = false;

      let errorMsg = `识别错误: ${e.errorDetails}`;
      const isTimeoutError =
        e.errorDetails?.includes("StatusCode: 0") ||
        e.errorDetails?.includes("Unable to contact server") ||
        e.errorDetails?.includes("StatusCode:0");

      if (e.errorDetails?.includes("StatusCode: 1006")) {
        errorMsg +=
          "\n提示: WebSocket 连接失败，请检查网络连接、Token有效性和防火墙设置";
      } else if (isTimeoutError) {
        errorMsg += "\n提示: 会话超时（通常发生在20分钟后）";
        // 如果是超时错误且启用了自动重连，则自动重连
        if (this.autoReconnectEnabled && wasRunning) {
          console.log("检测到超时错误，尝试自动重连...");
          setTimeout(() => {
            this.restartSession("检测到超时错误，自动重连");
          }, 1000); // 延迟1秒后重连
          return; // 不触发错误回调，因为会自动重连
        }
      }

      this.callbacks.onError?.(errorMsg);
    };

    this.conversationTranscriber.sessionStopped = (s, e) => {
      console.log({ method: "sessionStopped", s, e });
      const wasRunning = this.isRunning;
      this.isRunning = false;

      // 如果是因为超时导致的停止，且启用了自动重连，则自动重连
      // 注意：sessionStopped 会在 canceled 之后触发
      // 如果 canceled 事件已经处理了重连，这里就不需要再处理了
      // 但如果 canceled 没有触发（某些情况下），这里作为备用处理
      if (this.autoReconnectEnabled && wasRunning) {
        // 检查是否接近或超过18分钟（可能是超时导致的）
        const sessionDuration = this.sessionStartTime
          ? Date.now() - this.sessionStartTime
          : 0;

        if (sessionDuration >= 18 * 60 * 1000) {
          // 可能是超时导致的停止，尝试重连
          console.log("会话停止，可能是超时导致，尝试自动重连...");
          setTimeout(() => {
            this.restartSession("会话停止（可能是超时），自动重连");
          }, 1000);
          return; // 不触发停止回调，因为会自动重连
        }
      }

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
        return (
          json.SpeakerId || json.UserId || json.speakerId || json.userId || null
        );
      }
      if (result.privResult) {
        const priv = result.privResult;
        return (
          priv.SpeakerId || priv.speakerId || priv.UserId || priv.userId || null
        );
      }
    } catch {}
    return null;
  }

  stop() {
    // 停止 token 刷新定时器
    this.stopTokenRefresh();
    // 停止会话重启定时器
    this.stopSessionRestartTimer();
    // 禁用自动重连
    this.autoReconnectEnabled = false;

    if (this.conversationTranscriber && this.isRunning) {
      this.conversationTranscriber.stopTranscribingAsync(() => {
        this.isRunning = false;
      });
    }
    [this.conversationTranscriber, this.audioConfig, this.speechConfig].forEach(
      (resource) => resource?.close()
    );
    this.conversationTranscriber = this.audioConfig = this.speechConfig = null;
    this.sessionStartTime = null;
  }

  // 启用自动重连功能
  enableAutoReconnect() {
    this.autoReconnectEnabled = true;
    if (this.isRunning) {
      this.startSessionRestartTimer();
    }
  }

  // 禁用自动重连功能
  disableAutoReconnect() {
    this.autoReconnectEnabled = false;
    this.stopSessionRestartTimer();
  }
}

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [error, setError] = useState(null);
  const [speakers, setSpeakers] = useState(new Map());
  const [events, setEvents] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const speechServiceRef = useRef(null);
  const speakersRef = useRef(new Map());
  const eventsListRef = useRef(null);
  const transcriptionsListRef = useRef(null);
  const idCounterRef = useRef(0);
  const timerIntervalRef = useRef(null);

  // 生成唯一ID
  const generateUniqueId = () => {
    idCounterRef.current += 1;
    return `${Date.now()}-${idCounterRef.current}`;
  };

  // 格式化时间为 小时：分钟：秒
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    speakersRef.current = speakers;
  }, [speakers]);

  // 计时器管理 - 在会话真正开始时启动
  useEffect(() => {
    if (isSessionStarted) {
      // 启动计时器
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      // 停止计时器
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // 重置计时器
      setElapsedTime(0);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isSessionStarted]);

  // 自动滚动到事件日志底部
  useEffect(() => {
    if (eventsListRef.current) {
      eventsListRef.current.scrollTop = eventsListRef.current.scrollHeight;
    }
  }, [events]);

  // 自动滚动到转录记录底部
  useEffect(() => {
    if (transcriptionsListRef.current) {
      transcriptionsListRef.current.scrollTop =
        transcriptionsListRef.current.scrollHeight;
    }
  }, [transcriptions]);

  useEffect(() => {
    speechServiceRef.current = new SpeechService({
      onSessionStarted: () => {
        setIsSessionStarted(true);
        setElapsedTime(0); // 重置计时器
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "session_started",
            message: "会话已开始",
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onTranscribing: (text, speakerId) => {
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "transcribing",
            message: `正在识别: ${text}`,
            text,
            speakerId,
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onTranscribed: (text, speakerId) => {
        setSpeakers((prev) => {
          const newSpeakers = new Map(prev);
          if (speakerId && !newSpeakers.has(speakerId)) {
            newSpeakers.set(speakerId, newSpeakers.size + 1);
          }
          speakersRef.current = newSpeakers;
          const speakerNum = newSpeakers.get(speakerId);
          const speakerName = speakerNum ? `说话人-${speakerNum}` : "Unknown";

          setTranscriptions((prev) => [
            ...prev,
            {
              id: generateUniqueId(),
              text,
              speakerId,
              speakerName,
              timestamp: new Date().toLocaleTimeString("zh-CN"),
            },
          ]);

          setEvents((prev) => [
            ...prev,
            {
              id: generateUniqueId(),
              type: "transcribed",
              message: `识别完成: ${text}`,
              text,
              speakerId,
              speakerName,
              timestamp: new Date().toLocaleTimeString("zh-CN"),
            },
          ]);

          return newSpeakers;
        });
      },
      onSessionStopped: () => {
        setIsSessionStarted(false);
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "session_stopped",
            message: "会话已停止",
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onSessionRestarting: (reason) => {
        setIsSessionStarted(false); // 临时标记会话未启动
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "info",
            message: `🔄 ${reason || "正在重启会话"}...`,
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onSessionRestarted: () => {
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "info",
            message: "✅ 会话重启成功，继续识别中...",
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onSessionRestartFailed: (errorMsg) => {
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "error",
            message: `❌ 会话重启失败: ${errorMsg}`,
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setIsListening(false);
        setIsSessionStarted(false);
        setEvents((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            type: "error",
            message: `错误: ${errorMsg}`,
            timestamp: new Date().toLocaleTimeString("zh-CN"),
          },
        ]);
      },
    });

    return () => speechServiceRef.current?.stop();
  }, []);

  const handleStart = async () => {
    try {
      setError(null);
      setIsListening(true);
      // 启用自动重连功能
      speechServiceRef.current.enableAutoReconnect();
      await speechServiceRef.current.start();
    } catch (err) {
      setError(err.message || "启动失败");
      setIsListening(false);
    }
  };

  const handleStop = () => {
    speechServiceRef.current.stop();
    setIsListening(false);
    setIsSessionStarted(false);
  };

  const handleClear = () => {
    setTranscriptions([]);
    setSpeakers(new Map());
    setEvents([]);
    idCounterRef.current = 0;
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🎤 Azure Speech - 说话人分离</h1>
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
          <button
            className="btn btn-clear"
            onClick={handleClear}
            disabled={transcriptions.length === 0}
          >
            🗑️ 清空记录
          </button>
        </div>

        {error && <div className="error-message">❌ 错误: {error}</div>}

        {isListening && (
          <div className="listening-indicator">
            <div className="pulse"></div>
            <span>正在监听中...</span>
            {isSessionStarted && (
              <span className="timer">{formatTime(elapsedTime)}</span>
            )}
          </div>
        )}

        <div className="content-grid">
          <div className="events-log">
            <h2>事件日志</h2>
            {events.length === 0 ? (
              <div className="empty-state">
                <p>暂无事件记录</p>
              </div>
            ) : (
              <div className="events-list" ref={eventsListRef}>
                {events.map((event) => (
                  <div
                    key={event.id}
                    className={`event-item event-${event.type}`}
                  >
                    <div className="event-header">
                      <span className={`event-type event-type-${event.type}`}>
                        {event.type === "session_started" && "▶️"}
                        {event.type === "transcribing" && "🔄"}
                        {event.type === "transcribed" && "✅"}
                        {event.type === "session_stopped" && "⏹️"}
                        {event.type === "error" && "❌"}
                        {event.type === "info" && "ℹ️"}
                      </span>
                      <span className="event-timestamp">{event.timestamp}</span>
                    </div>
                    <div className="event-message">{event.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="transcriptions">
            <h2>转录记录（识别完成后显示）</h2>
            {transcriptions.length === 0 ? (
              <div className="empty-state">
                <p>暂无转录记录</p>
                <p className="hint">点击"开始识别"按钮开始语音识别</p>
              </div>
            ) : (
              <div className="transcription-list" ref={transcriptionsListRef}>
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
  );
}

export default App;
