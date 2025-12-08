# Azure Speech China Region - Real-time Speech Recognition

使用 Azure Speech 中国区服务实现实时语音识别转文字功能。

## 功能特性

- ✅ 支持 Azure Speech 中国区 token 申请
- ✅ 实时语音识别（连续识别模式）
- ✅ 单次语音识别
- ✅ 使用 uv 管理 Python 依赖

## 环境要求

- Python >= 3.8
- uv (Python 包管理器)

## 安装依赖

使用 uv 安装项目依赖：

```bash
uv sync
```

或者直接安装：

```bash
uv pip install -r requirements.txt
```

## 使用方法

### 1. 配置信息

在 `main.py` 中配置你的 Azure Speech 信息：

- `SUBSCRIPTION_KEY`: 你的订阅密钥
- `TOKEN_ENDPOINT`: Token 申请地址
- `REGION`: Azure 区域

### 2. 运行程序

```bash
uv run python main.py
```

或者激活虚拟环境后运行：

```bash
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate  # Windows

python main.py
```

### 3. 使用示例

程序运行后会提示选择识别模式：

- **连续识别模式**: 持续监听麦克风，实时转换语音为文字
- **单次识别模式**: 识别一次语音后停止

## 代码示例

### 基本使用

```python
from speech_client import AzureSpeechClient

# 创建客户端
client = AzureSpeechClient(
    subscription_key="your-key",
    token_endpoint="https://chinanorth3.api.cognitive.azure.cn/sts/v1.0/issuetoken",
    region="chinanorth3"
)

# 申请 token
token = client.get_access_token()

# 单次识别
result = client.recognize_once_from_microphone(language="zh-CN")

# 连续识别
def on_result(text):
    print(f"Recognized: {text}")

client.recognize_from_microphone(
    language="zh-CN",
    on_result=on_result
)
```

## 注意事项

1. 确保麦克风权限已授予
2. Token 有时效性，程序会自动处理 token 申请
3. 中国区需要使用特定的 endpoint 地址
4. 支持的语言代码：`zh-CN`（中文）、`en-US`（英文）等

## 依赖包

- `azure-cognitiveservices-speech`: Azure Speech SDK
- `requests`: HTTP 请求库

## 许可证

MIT
