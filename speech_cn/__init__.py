"""
Azure Speech China Region Client
实现 token 申请和实时语音识别转文字功能
"""

import requests
import azure.cognitiveservices.speech as speechsdk
from typing import Optional, Callable, List, Dict, Tuple


class AzureSpeechClient:
    """Azure Speech 中国区客户端"""

    def __init__(
        self, subscription_key: str, token_endpoint: str, region: str = "chinanorth3"
    ):
        """
        初始化 Azure Speech 客户端

        Args:
            subscription_key: Azure Speech 订阅密钥
            token_endpoint: Token 申请地址
            region: Azure 区域，默认为 chinanorth3
        """
        self.subscription_key = subscription_key
        self.token_endpoint = token_endpoint
        self.region = region
        self.token: Optional[str] = None

    def get_access_token(self) -> str:
        """
        申请访问 token

        Returns:
            访问 token 字符串

        Raises:
            Exception: 如果 token 申请失败
        """
        headers = {"Ocp-Apim-Subscription-Key": self.subscription_key}

        try:
            response = requests.post(self.token_endpoint, headers=headers)
            response.raise_for_status()
            self.token = response.text
            return self.token
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to get access token: {str(e)}")

    def recognize_from_microphone(
        self,
        language: str = "zh-CN",
        languages: Optional[List[str]] = None,
        on_result: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        """
        从麦克风实时识别语音并转换为文字

        Args:
            language: 识别语言，默认为中文（当 languages 为 None 时使用）
            languages: 要识别的语言列表，例如 ["zh-CN", "en-US"]，如果提供则启用多语言识别
            on_result: 识别结果回调函数，参数为识别的文本
            on_error: 错误回调函数，参数为错误信息
        """
        # 确保有有效的 token
        if not self.token:
            self.get_access_token()

        # 配置语音识别
        # 中国区使用 token 认证时，需要设置 endpoint 和 authorization_token
        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        # 先创建 SpeechConfig（使用 endpoint）
        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        # 然后设置 authorization_token 属性
        speech_config.authorization_token = self.token

        # 创建音频配置（使用默认麦克风）
        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        # 如果提供了多个语言，使用自动语言检测
        if languages and len(languages) > 1:
            # 创建自动语言检测配置
            auto_detect_config = (
                speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
                    languages=languages
                )
            )
            # 创建语音识别器（使用自动语言检测）
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
                auto_detect_source_language_config=auto_detect_config,
            )
            print(f"Multi-language recognition enabled: {', '.join(languages)}")
        else:
            # 单语言模式
            speech_config.speech_recognition_language = language
            # 创建语音识别器
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )

        def recognizing_cb(evt: speechsdk.SpeechRecognitionEventArgs):
            """中间识别结果回调（实时显示）"""
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    print(f"\r[Recognizing...] {text}", end="", flush=True)

        def recognized_cb(evt: speechsdk.SpeechRecognitionEventArgs):
            """最终识别结果回调"""
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    # 如果启用了多语言识别，显示检测到的语言
                    if languages and len(languages) > 1:
                        # 尝试获取检测到的语言
                        detected_language = getattr(evt.result, "language", None)
                        if detected_language:
                            print(f"\r[Recognized ({detected_language})] {text}")
                        else:
                            print(f"\r[Recognized] {text}")
                    else:
                        print(f"\r[Recognized] {text}")  # 换行显示最终结果
                    if on_result:
                        on_result(text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(evt: speechsdk.SpeechRecognitionCanceledEventArgs):
            """取消/错误回调"""
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            """会话开始回调"""
            print("Session started.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            """会话停止回调"""
            print("\nSession stopped.")

        # 连接事件处理
        speech_recognizer.recognizing.connect(recognizing_cb)  # 中间结果
        speech_recognizer.recognized.connect(recognized_cb)  # 最终结果
        speech_recognizer.canceled.connect(canceled_cb)
        speech_recognizer.session_started.connect(session_started_cb)
        speech_recognizer.session_stopped.connect(session_stopped_cb)

        print("Listening... Say something!")

        # 开始连续识别
        speech_recognizer.start_continuous_recognition()

        try:
            # 保持运行，直到用户中断
            input("Press Enter to stop...\n")
        except KeyboardInterrupt:
            pass
        finally:
            speech_recognizer.stop_continuous_recognition()
            print("Stopped recognition.")

    def recognize_once_from_microphone(self, language: str = "zh-CN") -> Optional[str]:
        """
        从麦克风识别一次语音（单次识别）

        Args:
            language: 识别语言，默认为中文

        Returns:
            识别的文本，如果识别失败返回 None
        """
        # 确保有有效的 token
        if not self.token:
            self.get_access_token()

        # 配置语音识别
        # 中国区使用 token 认证时，需要设置 endpoint 和 authorization_token
        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        # 先创建 SpeechConfig（使用 endpoint）
        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        # 然后设置 authorization_token 属性
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        # 创建音频配置
        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        # 创建语音识别器
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )

        print("Listening... Say something!")

        # 执行识别
        result = speech_recognizer.recognize_once()

        # 处理结果
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            text = result.text
            if text:
                print(f"\nRecognized: {text}")
                return text
            else:
                print("\nRecognized but text is empty")
                return None
        elif result.reason == speechsdk.ResultReason.NoMatch:
            print("\nNo speech could be recognized")
            return None
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = speechsdk.CancellationDetails(result)
            print(f"\nRecognition canceled: {cancellation_details.reason}")
            if cancellation_details.reason == speechsdk.CancellationReason.Error:
                print(f"Error details: {cancellation_details.error_details}")
            return None
        else:
            print(f"\nUnexpected result reason: {result.reason}")
            return None

    def transcribe_conversation(
        self,
        language: str = "zh-CN",
        phrases: Optional[List[str]] = None,
        phrase_weight: float = 1.0,
        on_result: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        """
        使用 ConversationTranscriber 进行会话转录，支持短语列表（PhraseListGrammar）设置

        Args:
            language: 识别语言，默认为中文
            phrases: 要添加到短语列表的短语列表，用于提高识别准确度
            phrase_weight: 短语列表权重，范围 0.0 到 2.0，默认 1.0
            on_result: 识别结果回调函数，参数为识别的文本
            on_error: 错误回调函数，参数为错误信息
        """
        # 确保有有效的 token
        if not self.token:
            self.get_access_token()

        # 配置语音识别
        # 中国区使用 token 认证时，需要设置 endpoint 和 authorization_token
        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        # 先创建 SpeechConfig（使用 endpoint）
        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        # 然后设置 authorization_token 属性
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        # 创建音频配置（使用默认麦克风）
        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        # 创建 ConversationTranscriber
        conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
            speech_config=speech_config, audio_config=audio_config
        )

        # 设置 PhraseListGrammar（短语列表）
        if phrases:
            phrase_list_grammar = speechsdk.PhraseListGrammar.from_recognizer(
                conversation_transcriber
            )
            for phrase in phrases:
                phrase_list_grammar.add_phrase(phrase)
            # 设置权重（可选）
            if phrase_weight != 1.0:
                phrase_list_grammar.set_weight(phrase_weight)
            print(
                f"Added {len(phrases)} phrases to phrase list grammar (weight: {phrase_weight})"
            )

        def transcribing_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            """转录中回调（实时显示）"""
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    print(f"\r[Transcribing...] {text}", end="", flush=True)

        def transcribed_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            """转录完成回调"""
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    print(f"\r[Transcribed] {text}")  # 换行显示最终结果
                    if on_result:
                        on_result(text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(
            evt: speechsdk.transcription.ConversationTranscriptionCanceledEventArgs,
        ):
            """取消/错误回调"""
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            """会话开始回调"""
            print("Session started.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            """会话停止回调"""
            print("\nSession stopped.")

        # 连接事件处理
        conversation_transcriber.transcribing.connect(transcribing_cb)  # 中间结果
        conversation_transcriber.transcribed.connect(transcribed_cb)  # 最终结果
        conversation_transcriber.canceled.connect(canceled_cb)
        conversation_transcriber.session_started.connect(session_started_cb)
        conversation_transcriber.session_stopped.connect(session_stopped_cb)

        print("Listening... Say something!")

        # 开始转录
        conversation_transcriber.start_transcribing_async()

        try:
            # 保持运行，直到用户中断
            input("Press Enter to stop...\n")
        except KeyboardInterrupt:
            pass
        finally:
            conversation_transcriber.stop_transcribing_async()
            print("Stopped transcription.")

    def transcribe_with_speaker_diarization(
        self,
        language: str = "zh-CN",
        phrases: Optional[List[str]] = None,
        phrase_weight: float = 1.0,
        on_result: Optional[Callable[[str, str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        """
        使用 ConversationTranscriber 进行会话转录，支持说话人分离（Speaker Diarization）

        说话人分离功能可以自动识别并区分不同的说话人，为每个说话人分配唯一的标识符。

        Args:
            language: 识别语言，默认为中文
            phrases: 要添加到短语列表的短语列表，用于提高识别准确度
            phrase_weight: 短语列表权重，范围 0.0 到 2.0，默认 1.0
            on_result: 识别结果回调函数，参数为 (speaker_id, text)
                       speaker_id: 说话人标识符（如 "Guest-1", "Guest-2" 等）
                       text: 识别的文本
            on_error: 错误回调函数，参数为错误信息
        """
        # 确保有有效的 token
        if not self.token:
            self.get_access_token()

        # 配置语音识别
        # 中国区使用 token 认证时，需要设置 endpoint 和 authorization_token
        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        # 先创建 SpeechConfig（使用 endpoint）
        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        # 然后设置 authorization_token 属性
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        # 创建音频配置（使用默认麦克风）
        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        # 创建 ConversationTranscriber
        conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
            speech_config=speech_config, audio_config=audio_config
        )

        # 设置 PhraseListGrammar（短语列表）
        if phrases:
            phrase_list_grammar = speechsdk.PhraseListGrammar.from_recognizer(
                conversation_transcriber
            )
            for phrase in phrases:
                phrase_list_grammar.add_phrase(phrase)
            # 设置权重（可选）
            if phrase_weight != 1.0:
                phrase_list_grammar.set_weight(phrase_weight)
            print(
                f"Added {len(phrases)} phrases to phrase list grammar (weight: {phrase_weight})"
            )

        # 用于跟踪说话人
        speaker_map: Dict[str, int] = {}
        speaker_counter = 1

        def get_speaker_display_name(speaker_id: str) -> str:
            """获取说话人的显示名称"""
            if not speaker_id:
                return "Unknown"
            if speaker_id not in speaker_map:
                nonlocal speaker_counter
                speaker_map[speaker_id] = speaker_counter
                speaker_counter += 1
            return f"Speaker-{speaker_map[speaker_id]}"

        def transcribing_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            """转录中回调（实时显示）"""
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    # 尝试获取说话人信息
                    speaker_id = (
                        getattr(evt.result, "user_id", None)
                        or getattr(evt.result, "speaker_id", None)
                        or ""
                    )
                    speaker_name = (
                        get_speaker_display_name(speaker_id)
                        if speaker_id
                        else "Unknown"
                    )
                    print(
                        f"\r[{speaker_name} - Transcribing...] {text}",
                        end="",
                        flush=True,
                    )

        def transcribed_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            """转录完成回调"""
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:  # 只打印非空文本
                    # 尝试获取说话人信息
                    # Azure Speech SDK 中，说话人信息可能在 result 的不同属性中
                    speaker_id = None
                    try:
                        # 尝试从不同属性获取说话人ID
                        speaker_id = getattr(evt.result, "user_id", None)
                        if not speaker_id:
                            speaker_id = getattr(evt.result, "speaker_id", None)
                        # 有些版本可能在 JSON 结果中
                        if not speaker_id and hasattr(evt.result, "json"):
                            import json

                            result_json = json.loads(evt.result.json)
                            speaker_id = result_json.get(
                                "SpeakerId"
                            ) or result_json.get("UserId")
                    except Exception:
                        pass

                    speaker_name = (
                        get_speaker_display_name(speaker_id)
                        if speaker_id
                        else "Unknown"
                    )
                    display_text = f"[{speaker_name}] {text}"
                    print(f"\r{display_text}")  # 换行显示最终结果

                    if on_result:
                        on_result(speaker_id or "Unknown", text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(
            evt: speechsdk.transcription.ConversationTranscriptionCanceledEventArgs,
        ):
            """取消/错误回调"""
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            """会话开始回调"""
            print("Session started. Speaker diarization enabled.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            """会话停止回调"""
            print(f"\nSession stopped. Identified {len(speaker_map)} speaker(s).")

        # 连接事件处理
        conversation_transcriber.transcribing.connect(transcribing_cb)  # 中间结果
        conversation_transcriber.transcribed.connect(transcribed_cb)  # 最终结果
        conversation_transcriber.canceled.connect(canceled_cb)
        conversation_transcriber.session_started.connect(session_started_cb)
        conversation_transcriber.session_stopped.connect(session_stopped_cb)

        print("Listening with speaker diarization... Say something!")
        print("The system will automatically identify different speakers.")

        # 开始转录
        conversation_transcriber.start_transcribing_async()

        try:
            # 保持运行，直到用户中断
            input("Press Enter to stop...\n")
        except KeyboardInterrupt:
            pass
        finally:
            conversation_transcriber.stop_transcribing_async()
            print("Stopped transcription.")
