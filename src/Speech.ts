import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'

export interface SpeechResultPayload {
    text: string
    speakerId?: string
    offset?: number
    duration?: number
    resultId?: string
}

export interface SpeechCallbacks {
    onTranscribing?: (payload: SpeechResultPayload) => void
    onTranscribed?: (payload: SpeechResultPayload) => void
    onCanceled?: (error: Error) => void
    onStopped?: () => void
}

export interface SpeechOptions {
    token: string
    region: string
    language: string,
    sourceLanguageConfig: string[],
    phraseList: string[],
}

export default class MsSpeechTranscriber {
    private recognizer: speechsdk.ConversationTranscriber | null = null
    private pushStream: speechsdk.PushAudioInputStream | null = null
    private started = false

    async start(options: SpeechOptions, callbacks: SpeechCallbacks) {
        if (this.started) {
            await this.stop()
        }

        const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(options.token, options.region)
        speechConfig.speechRecognitionLanguage = options.language
        speechConfig.setProperty(speechsdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults, 'false')
        speechConfig.setProperty(speechsdk.PropertyId.Conversation_Initial_Silence_Timeout, '0')

        // speechsdk.Diagnostics.SetLoggingLevel(speechsdk.LogLevel.Debug)
        // speechsdk.Diagnostics.SetLogOutputPath("LogfilePathAndName")

        const autoDetectSourceLanguageConfig = speechsdk.AutoDetectSourceLanguageConfig.fromLanguages(options.sourceLanguageConfig)
        const audioFormat = speechsdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
        this.pushStream = speechsdk.AudioInputStream.createPushStream(audioFormat)
        const audioConfig = speechsdk.AudioConfig.fromStreamInput(this.pushStream)
        const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
        speechsdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig)
        this.recognizer = new speechsdk.ConversationTranscriber(speechConfig, audioConfig)
        const phraseListGrammar = speechsdk.PhraseListGrammar.fromRecognizer(this.recognizer)
        phraseListGrammar.addPhrases(options.phraseList)
        this.recognizer.transcribing = (_, e) => {
            console.log('transcribing', e.result.text)
            callbacks.onTranscribing?.(this.buildPayload(e))
        }

        this.recognizer.transcribed = (_, e) => {
            callbacks.onTranscribed?.(this.buildPayload(e))
        }

        this.recognizer.canceled = (_, e) => {
            callbacks.onCanceled?.(new Error(e.errorDetails || 'Speech SDK canceled'))
        }

        this.recognizer.sessionStopped = () => {
            callbacks.onStopped?.()
        }

        await new Promise<void>((resolve, reject) => {
            this.recognizer?.startTranscribingAsync(
                () => {
                    this.started = true
                    resolve()
                },
                (error) => {
                    reject(error)
                }
            )
        })
    }

    pushAudio(chunk: Int8Array) {
        if (!this.started || !this.pushStream) return
        // 创建一个新的 ArrayBuffer 并复制数据，确保类型正确
        const buffer = new ArrayBuffer(chunk.byteLength)
        const view = new Int8Array(buffer)
        view.set(chunk)
        this.pushStream.write(buffer)
    }

    async stop() {
        if (!this.started) return
        await new Promise<void>((resolve, reject) => {
            this.recognizer?.stopTranscribingAsync(
                () => resolve(),
                (error) => reject(error)
            )
        })
        this.disposeRecognizer()
    }

    isStarted() {
        return this.started
    }

    private disposeRecognizer() {
        this.recognizer?.close()
        this.recognizer = null
        this.pushStream?.close()
        this.pushStream = null
        this.started = false
    }

    private buildPayload(e: speechsdk.ConversationTranscriptionEventArgs): SpeechResultPayload {
        const result = e.result
        return {
            text: result?.text || '',
            speakerId: result?.speakerId,
            offset: typeof result?.offset === 'number' ? result.offset : undefined,
            duration: typeof result?.duration === 'number' ? result.duration : undefined
        }
    }
}