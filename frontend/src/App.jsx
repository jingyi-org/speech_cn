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
      return {
        token: response.data.token,
        region: response.data.region,
      };
    } catch (error) {
      throw new Error(
        `获取token失败: ${error.response?.data?.detail || error.message}`
      );
    }
  }

  async start() {
    if (this.isRunning) {
      console.warn("语音识别已在运行中");
      return;
    }

    try {
      // 获取token和region
      const { token, region } = await this.getToken();
      console.log("获取到 token 和 region:", {
        region,
        tokenLength: token?.length,
      });

      // 配置语音识别 - 对于中国区域，需要手动设置端点
      const endpoint = `wss://${region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1`;
      console.log("使用端点:", endpoint);

      // 方法1: 尝试使用 fromAuthorizationToken（推荐方式）
      // 对于中国区域，SDK 可能不会自动识别 .azure.cn 端点，需要手动设置
      try {
        this.speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
          token,
          region
        );

        // 手动设置中国区域的端点（覆盖默认端点）
        // 使用字符串属性名以确保兼容性
        this.speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_Endpoint,
          endpoint
        );
        // 同时设置授权 token（确保 token 正确传递）
        this.speechConfig.authorizationToken = token;
      } catch (configError) {
        console.warn("fromAuthorizationToken 失败，尝试备用方法:", configError);
        // 备用方法：使用 fromEndpoint（需要传入订阅密钥，但我们只有 token）
        // 注意：这个方法可能不适用于 token 认证
        throw new Error(`配置失败: ${configError.message}`);
      }

      // 设置语言
      this.speechConfig.speechRecognitionLanguage = "zh-CN";

      // 确保启用说话人分离功能
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
        "2000"
      );

      // 验证配置
      console.log("SpeechConfig 属性:", {
        endpoint: this.speechConfig.getProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_Endpoint
        ),
        language: this.speechConfig.speechRecognitionLanguage,
        hasToken: !!this.speechConfig.authorizationToken,
      });

      // 添加调试信息
      console.log("SpeechConfig 配置完成");

      // 配置音频输入（使用浏览器麦克风）
      this.audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

      // 创建对话转录器
      this.conversationTranscriber = new SpeechSDK.ConversationTranscriber(
        this.speechConfig,
        this.audioConfig
      );

      // 设置事件回调
      this.setupEventHandlers();

      // 开始转录
      this.conversationTranscriber.startTranscribingAsync(
        () => {
          this.isRunning = true;
          if (this.callbacks.onSessionStarted) {
            this.callbacks.onSessionStarted();
          }
        },
        (error) => {
          this.isRunning = false;
          if (this.callbacks.onError) {
            this.callbacks.onError(`启动失败: ${error}`);
          }
        }
      );
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  setupEventHandlers() {
    // 实时转录中
    this.conversationTranscriber.transcribing = (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
        const text = e.result.text;
        if (text) {
          const speakerId = this.extractSpeakerId(e.result);
          console.log("transcribing事件:", { text, speakerId });
          if (this.callbacks.onTranscribing) {
            this.callbacks.onTranscribing(text, speakerId);
          }
        }
      }
    };

    // 转录完成
    this.conversationTranscriber.transcribed = (s, e) => {
      console.log("transcribed事件触发:", {
        reason: e.result.reason,
        reasonName: SpeechSDK.ResultReason[e.result.reason],
        text: e.result.text,
        hasText: !!e.result.text,
      });

      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        const text = e.result.text;
        if (text) {
          const speakerId = this.extractSpeakerId(e.result);
          console.log("准备调用onTranscribed回调:", { text, speakerId });
          if (this.callbacks.onTranscribed) {
            this.callbacks.onTranscribed(text, speakerId);
          } else {
            console.warn("onTranscribed回调未定义");
          }
        } else {
          console.warn("识别结果文本为空");
        }
      } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
        console.log("无法识别语音");
      } else {
        console.log("transcribed事件触发，但reason不是RecognizedSpeech:", {
          reason: e.result.reason,
          reasonName: SpeechSDK.ResultReason[e.result.reason],
        });
      }
    };

    // 错误处理
    this.conversationTranscriber.canceled = (s, e) => {
      this.isRunning = false;
      console.error("转录取消事件:", {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails,
        cancellationReason: SpeechSDK.CancellationReason[e.reason],
      });

      let errorMsg = `错误: ${e.errorDetails}`;
      if (e.reason === SpeechSDK.CancellationReason.Error) {
        errorMsg = `识别错误: ${e.errorDetails}`;
        // 如果是 WebSocket 连接错误，提供更详细的错误信息
        if (e.errorDetails && e.errorDetails.includes("StatusCode: 1006")) {
          errorMsg +=
            "\n提示: WebSocket 连接失败，请检查：\n1. 网络连接是否正常\n2. Token 是否有效\n3. 防火墙是否阻止了 WebSocket 连接";
        }
      }
      if (this.callbacks.onError) {
        this.callbacks.onError(errorMsg);
      }
    };

    // 会话停止
    this.conversationTranscriber.sessionStopped = (s, e) => {
      this.isRunning = false;
      if (this.callbacks.onSessionStopped) {
        this.callbacks.onSessionStopped();
      }
    };
  }

  extractSpeakerId(result) {
    // 尝试从不同属性获取说话人ID
    // Azure Speech SDK的说话人分离结果可能在不同版本中有不同的属性名
    try {
      // 方法1: 直接从result属性获取（最常见的方式）
      if (result.userId) {
        return result.userId;
      }
      if (result.speakerId) {
        return result.speakerId;
      }

      // 方法2: 从JSON字符串中解析
      if (result.json) {
        const jsonResult = JSON.parse(result.json);
        // 尝试多种可能的字段名
        return (
          jsonResult.SpeakerId ||
          jsonResult.UserId ||
          jsonResult.speakerId ||
          jsonResult.userId ||
          null
        );
      }

      // 方法3: 从私有属性中获取（某些SDK版本）
      if (result.privResult) {
        const privResult = result.privResult;
        if (privResult.SpeakerId || privResult.speakerId) {
          return privResult.SpeakerId || privResult.speakerId;
        }
        if (privResult.UserId || privResult.userId) {
          return privResult.UserId || privResult.userId;
        }
      }

      // 方法4: 检查result的所有属性（调试用）
      if (process.env.NODE_ENV === "development") {
        console.log("Result对象属性:", Object.keys(result));
        console.log("Result详情:", result);
      }
    } catch (error) {
      console.warn("提取说话人ID失败:", error);
    }

    return null;
  }

  stop() {
    if (this.conversationTranscriber && this.isRunning) {
      this.conversationTranscriber.stopTranscribingAsync(
        () => {
          this.isRunning = false;
          console.log("已停止转录");
        },
        (error) => {
          this.isRunning = false;
          console.error("停止转录失败:", error);
        }
      );
    }

    // 清理资源
    if (this.conversationTranscriber) {
      this.conversationTranscriber.close();
      this.conversationTranscriber = null;
    }
    if (this.audioConfig) {
      this.audioConfig.close();
      this.audioConfig = null;
    }
    if (this.speechConfig) {
      this.speechConfig.close();
      this.speechConfig = null;
    }
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
    // 同步speakers到ref，以便在回调中使用最新值
    speakersRef.current = speakers
  }, [speakers])

  useEffect(() => {
    // 初始化语音服务
    speechServiceRef.current = new SpeechService({
      onTranscribing: (text, speakerId) => {
        // 实时转录中
        console.log(`[${speakerId} - 转录中...] ${text}`)
      },
      onTranscribed: (text, speakerId) => {
        // 转录完成
        console.log("onTranscribed回调被调用:", { text, speakerId });
        
        // 更新speakers状态
        setSpeakers(prev => {
          const newSpeakers = new Map(prev)
          if (speakerId && !newSpeakers.has(speakerId)) {
            newSpeakers.set(speakerId, newSpeakers.size + 1)
          }
          // 立即更新ref，以便后续使用
          speakersRef.current = newSpeakers
          return newSpeakers
        })

        // 使用ref获取最新的speakers值（因为setSpeakers是异步的）
        const currentSpeakers = speakersRef.current
        const speakerName = speakerId && currentSpeakers.has(speakerId)
          ? `说话人-${currentSpeakers.get(speakerId)}`
          : 'Unknown'

        console.log("准备更新transcriptions状态:", { text, speakerName, speakersSize: currentSpeakers.size });
        
        // 更新transcriptions状态
        setTranscriptions(prev => {
          const newTranscriptions = [
            ...prev,
            {
              id: Date.now(),
              text,
              speakerId,
              speakerName,
              timestamp: new Date().toLocaleTimeString('zh-CN')
            }
          ];
          console.log("transcriptions状态已更新，新长度:", newTranscriptions.length, "内容:", newTranscriptions);
          return newTranscriptions;
        })
      },
      onError: (errorMsg) => {
        setError(errorMsg)
        setIsListening(false)
      },
      onSessionStarted: () => {
        console.log('会话已开始，说话人分离已启用')
      },
      onSessionStopped: () => {
        console.log(`会话已停止，识别到 ${speakersRef.current.size} 个说话人`)
      }
    })

    return () => {
      // 清理
      if (speechServiceRef.current) {
        speechServiceRef.current.stop()
      }
    }
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

