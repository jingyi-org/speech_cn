import os
import requests
import azure.cognitiveservices.speech as speechsdk
from typing import Optional, Callable, List, Dict
from dotenv import load_dotenv

load_dotenv()


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


def main():

    SUBSCRIPTION_KEY = os.getenv("AZURE_SPEECH_SUBSCRIPTION_KEY")
    TOKEN_ENDPOINT = os.getenv("AZURE_SPEECH_TOKEN_ENDPOINT")
    REGION = os.getenv("AZURE_SPEECH_REGION")

    if not all([SUBSCRIPTION_KEY, TOKEN_ENDPOINT, REGION]):
        raise ValueError(
            "Missing required environment variables. Please check your .env file."
        )

    client = AzureSpeechClient(
        subscription_key=SUBSCRIPTION_KEY, token_endpoint=TOKEN_ENDPOINT, region=REGION
    )

    print("=" * 50)
    print("Azure Speech China Region - Real-time Recognition")
    print("=" * 50)

    try:
        print("\n1. Requesting access token...")
        token = client.get_access_token()
        print(f"Token obtained successfully (length: {len(token)})")
    except Exception as e:
        print(f"Failed to get token: {e}")
        return

    print("\n2. Starting speaker diarization (说话人分离)...")

    def on_result(speaker_id: str, text: str):
        print(f"\n>>> [{speaker_id}] {text}")

    def on_error(error: str):
        print(f"\n!!! {error}")

    print("This mode will automatically identify different speakers.")
    client.transcribe_with_speaker_diarization(
        language="zh-CN", on_result=on_result, on_error=on_error
    )


if __name__ == "__main__":
    main()
