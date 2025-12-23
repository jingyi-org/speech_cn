import os
from dotenv import load_dotenv
from AzureSpeechClient import AzureSpeechClient

load_dotenv()


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

    print("\n2. Select recognition mode:")
    print("   [1] Continuous recognition (press Enter to stop)")
    print("   [2] Single recognition")
    print("   [3] Conversation transcription")
    print("   [4] Speaker diarization (说话人分离)")

    choice = input("\nEnter your choice (1, 2, 3, or 4): ").strip()

    if choice == "1":

        def on_result(text: str):
            print(f"\n>>> {text}")

        def on_error(error: str):
            print(f"\n!!! {error}")

        print("\nStarting continuous recognition...")
        client.recognize_from_microphone(
            languages=["zh-CN", "en-US"], on_result=on_result, on_error=on_error
        )
    elif choice == "2":
        print("\nStarting single recognition...")
        result = client.recognize_once_from_microphone(language="zh-CN")
        if result:
            print(f"\nFinal result: {result}")
    elif choice == "3":

        def on_result(text: str):
            print(f"\n>>> {text}")

        def on_error(error: str):
            print(f"\n!!! {error}")

        print("\nStarting conversation transcription...")
        client.transcribe_conversation(
            language="zh-CN", on_result=on_result, on_error=on_error
        )
    elif choice == "4":

        def on_result(speaker_id: str, text: str):
            print(f"\n>>> [{speaker_id}] {text}")

        def on_error(error: str):
            print(f"\n!!! {error}")

        print("\nStarting speaker diarization...")
        print("This mode will automatically identify different speakers.")
        client.transcribe_with_speaker_diarization(
            language="zh-CN", on_result=on_result, on_error=on_error
        )
    else:
        print("Invalid choice. Exiting.")


if __name__ == "__main__":
    main()
