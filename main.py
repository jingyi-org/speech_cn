"""
主程序入口
演示如何使用 Azure Speech 中国区服务进行实时语音识别
"""

import os
from dotenv import load_dotenv
from speech_cn import AzureSpeechClient

# 加载环境变量
load_dotenv()


def main():

    # Azure Speech 中国区配置（从环境变量读取）
    SUBSCRIPTION_KEY = os.getenv("AZURE_SPEECH_SUBSCRIPTION_KEY")
    TOKEN_ENDPOINT = os.getenv("AZURE_SPEECH_TOKEN_ENDPOINT")
    REGION = os.getenv("AZURE_SPEECH_REGION")

    # 验证必要的环境变量
    if not all([SUBSCRIPTION_KEY, TOKEN_ENDPOINT, REGION]):
        raise ValueError(
            "Missing required environment variables. Please check your .env file."
        )

    # 创建客户端
    client = AzureSpeechClient(
        subscription_key=SUBSCRIPTION_KEY, token_endpoint=TOKEN_ENDPOINT, region=REGION
    )

    print("=" * 50)
    print("Azure Speech China Region - Real-time Recognition")
    print("=" * 50)

    # 申请 token
    try:
        print("\n1. Requesting access token...")
        token = client.get_access_token()
        print(f"Token obtained successfully (length: {len(token)})")
    except Exception as e:
        print(f"Failed to get token: {e}")
        return

    # 选择识别模式
    print("\n2. Select recognition mode:")
    print("   [1] Continuous recognition (press Enter to stop)")
    print("   [2] Single recognition")
    print("   [3] Conversation transcription")
    print("   [4] Speaker diarization (说话人分离)")

    choice = input("\nEnter your choice (1, 2, 3, or 4): ").strip()

    if choice == "1":
        # 连续识别模式
        def on_result(text: str):
            """识别结果回调"""
            print(f"\n>>> {text}")

        def on_error(error: str):
            """错误回调"""
            print(f"\n!!! {error}")

        print("\nStarting continuous recognition...")
        # 支持同时识别中文和英文
        client.recognize_from_microphone(
            languages=["zh-CN", "en-US"], on_result=on_result, on_error=on_error
        )
    elif choice == "2":
        # 单次识别模式
        print("\nStarting single recognition...")
        result = client.recognize_once_from_microphone(language="zh-CN")
        if result:
            print(f"\nFinal result: {result}")
    elif choice == "3":
        # 会话转录模式
        def on_result(text: str):
            """识别结果回调"""
            print(f"\n>>> {text}")

        def on_error(error: str):
            """错误回调"""
            print(f"\n!!! {error}")

        print("\nStarting conversation transcription...")
        client.transcribe_conversation(
            language="zh-CN", on_result=on_result, on_error=on_error
        )
    elif choice == "4":
        # 说话人分离模式
        def on_result(speaker_id: str, text: str):
            """识别结果回调，包含说话人信息"""
            print(f"\n>>> [{speaker_id}] {text}")

        def on_error(error: str):
            """错误回调"""
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
