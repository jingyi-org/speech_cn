import { useState, useEffect, useRef } from 'react'
import SpeechService from './services/speechService'
import './App.css'

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

