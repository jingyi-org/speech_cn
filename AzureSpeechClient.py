import requests
import azure.cognitiveservices.speech as speechsdk
from typing import Optional, Callable, List, Dict, Tuple


class AzureSpeechClient:

    def __init__(
        self, subscription_key: str, token_endpoint: str, region: str = "chinanorth3"
    ):
        self.subscription_key = subscription_key
        self.token_endpoint = token_endpoint
        self.region = region
        self.token: Optional[str] = None

    def get_access_token(self) -> str:
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
        if not self.token:
            self.get_access_token()

        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        speech_config.authorization_token = self.token

        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        if languages and len(languages) > 1:
            auto_detect_config = (
                speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
                    languages=languages
                )
            )
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
                auto_detect_source_language_config=auto_detect_config,
            )
            print(f"Multi-language recognition enabled: {', '.join(languages)}")
        else:
            speech_config.speech_recognition_language = language
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )

        def recognizing_cb(evt: speechsdk.SpeechRecognitionEventArgs):
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:
                    print(f"\r[Recognizing...] {text}", end="", flush=True)

        def recognized_cb(evt: speechsdk.SpeechRecognitionEventArgs):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:
                    if languages and len(languages) > 1:
                        detected_language = getattr(evt.result, "language", None)
                        if detected_language:
                            print(f"\r[Recognized ({detected_language})] {text}")
                        else:
                            print(f"\r[Recognized] {text}")
                    else:
                        print(f"\r[Recognized] {text}")
                    if on_result:
                        on_result(text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(evt: speechsdk.SpeechRecognitionCanceledEventArgs):
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            print("Session started.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            print("\nSession stopped.")

        speech_recognizer.recognizing.connect(recognizing_cb)
        speech_recognizer.recognized.connect(recognized_cb)
        speech_recognizer.canceled.connect(canceled_cb)
        speech_recognizer.session_started.connect(session_started_cb)
        speech_recognizer.session_stopped.connect(session_stopped_cb)

        print("Listening... Say something!")

        speech_recognizer.start_continuous_recognition()

        try:
            input("Press Enter to stop...\n")
        except KeyboardInterrupt:
            pass
        finally:
            speech_recognizer.stop_continuous_recognition()
            print("Stopped recognition.")

    def recognize_once_from_microphone(self, language: str = "zh-CN") -> Optional[str]:
        if not self.token:
            self.get_access_token()

        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )

        print("Listening... Say something!")

        result = speech_recognizer.recognize_once()

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
        if not self.token:
            self.get_access_token()

        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
            speech_config=speech_config, audio_config=audio_config
        )

        if phrases:
            phrase_list_grammar = speechsdk.PhraseListGrammar.from_recognizer(
                conversation_transcriber
            )
            for phrase in phrases:
                phrase_list_grammar.add_phrase(phrase)
            if phrase_weight != 1.0:
                phrase_list_grammar.set_weight(phrase_weight)
            print(
                f"Added {len(phrases)} phrases to phrase list grammar (weight: {phrase_weight})"
            )

        def transcribing_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:
                    print(f"\r[Transcribing...] {text}", end="", flush=True)

        def transcribed_cb(
            evt: speechsdk.transcription.ConversationTranscriptionEventArgs,
        ):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:
                    print(f"\r[Transcribed] {text}")
                    if on_result:
                        on_result(text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(
            evt: speechsdk.transcription.ConversationTranscriptionCanceledEventArgs,
        ):
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            print("Session started.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            print("\nSession stopped.")

        conversation_transcriber.transcribing.connect(transcribing_cb)
        conversation_transcriber.transcribed.connect(transcribed_cb)
        conversation_transcriber.canceled.connect(canceled_cb)
        conversation_transcriber.session_started.connect(session_started_cb)
        conversation_transcriber.session_stopped.connect(session_stopped_cb)

        print("Listening... Say something!")

        conversation_transcriber.start_transcribing_async()

        try:
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
        if not self.token:
            self.get_access_token()

        endpoint = f"wss://{self.region}.stt.speech.azure.cn/speech/recognition/conversation/cognitiveservices/v1"

        speech_config = speechsdk.SpeechConfig(endpoint=endpoint)
        speech_config.authorization_token = self.token
        speech_config.speech_recognition_language = language

        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
            speech_config=speech_config, audio_config=audio_config
        )

        if phrases:
            phrase_list_grammar = speechsdk.PhraseListGrammar.from_recognizer(
                conversation_transcriber
            )
            for phrase in phrases:
                phrase_list_grammar.add_phrase(phrase)
            if phrase_weight != 1.0:
                phrase_list_grammar.set_weight(phrase_weight)
            print(
                f"Added {len(phrases)} phrases to phrase list grammar (weight: {phrase_weight})"
            )

        speaker_map: Dict[str, int] = {}
        speaker_counter = 1

        def get_speaker_display_name(speaker_id: str) -> str:
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
            if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                text = evt.result.text
                if text:
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
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = evt.result.text
                if text:
                    speaker_id = None
                    try:
                        speaker_id = getattr(evt.result, "user_id", None)
                        if not speaker_id:
                            speaker_id = getattr(evt.result, "speaker_id", None)
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
                    print(f"\r{display_text}")

                    if on_result:
                        on_result(speaker_id or "Unknown", text)
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                print("\nNo speech could be recognized")

        def canceled_cb(
            evt: speechsdk.transcription.ConversationTranscriptionCanceledEventArgs,
        ):
            error_msg = f"Error: {evt.error_details}"
            print(f"\n{error_msg}")
            if on_error:
                on_error(error_msg)

        def session_started_cb(evt: speechsdk.SessionEventArgs):
            print("Session started. Speaker diarization enabled.")

        def session_stopped_cb(evt: speechsdk.SessionEventArgs):
            print(f"\nSession stopped. Identified {len(speaker_map)} speaker(s).")

        conversation_transcriber.transcribing.connect(transcribing_cb)
        conversation_transcriber.transcribed.connect(transcribed_cb)
        conversation_transcriber.canceled.connect(canceled_cb)
        conversation_transcriber.session_started.connect(session_started_cb)
        conversation_transcriber.session_stopped.connect(session_stopped_cb)

        print("Listening with speaker diarization... Say something!")
        print("The system will automatically identify different speakers.")

        conversation_transcriber.start_transcribing_async()

        try:
            input("Press Enter to stop...\n")
        except KeyboardInterrupt:
            pass
        finally:
            conversation_transcriber.stop_transcribing_async()
            print("Stopped transcription.")
