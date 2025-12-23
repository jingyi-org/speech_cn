# 快速启动指南

## 前置准备

1. 确保已安装 Python 3.8+和 Node.js 16+
2. 准备 Azure Speech 服务的订阅密钥和 token 端点

## 步骤 1: 配置环境变量

在项目根目录创建 `.env` 文件：

```env
AZURE_SPEECH_SUBSCRIPTION_KEY=your_subscription_key
AZURE_SPEECH_TOKEN_ENDPOINT=https://your-region.api.cognitive.azure.cn/sts/v1.0/issueToken
AZURE_SPEECH_REGION=chinanorth3
```

## 步骤 2: 安装依赖

### 后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 前端依赖

```bash
cd frontend
npm install
```

## 步骤 3: 启动服务

### 方式 1: 使用启动脚本（推荐）

**终端 1 - 启动后端:**

```bash
./start-backend.sh
```

**终端 2 - 启动前端:**

```bash
./start-frontend.sh
```

### 方式 2: 手动启动

**终端 1 - 启动后端:**

```bash
cd backend
uvicorn api:app --reload --port 8000
```

**终端 2 - 启动前端:**

```bash
cd frontend
npm run dev
```

## 步骤 4: 访问应用

打开浏览器访问: `http://localhost:3000`

## 使用流程

1. 点击"开始识别"按钮
2. 允许浏览器访问麦克风权限
3. 开始说话，系统会自动识别并显示转录结果
4. 不同说话人的内容会以不同标签显示（说话人-1, 说话人-2 等）
5. 点击"停止识别"结束会话

## 故障排查

### 后端无法启动

- 检查 Python 版本: `python --version`
- 检查依赖是否安装: `pip list | grep fastapi`
- 检查环境变量是否配置正确

### 前端无法启动

- 检查 Node.js 版本: `node --version`
- 检查依赖是否安装: `cd frontend && npm list`
- 清除缓存重新安装: `rm -rf node_modules package-lock.json && npm install`

### 无法获取 token

- 检查后端服务是否运行: `curl http://localhost:8000/api/health`
- 检查环境变量中的订阅密钥是否正确
- 检查 token 端点 URL 是否正确

### 浏览器无法访问麦克风

- 确保使用现代浏览器（Chrome, Edge, Firefox 等）
- 检查浏览器权限设置
- 生产环境需要使用 HTTPS

### 说话人分离不工作

- 检查浏览器控制台是否有错误信息
- 确保使用 ConversationTranscriber 而不是 SpeechRecognizer
- 检查 Azure 服务是否支持说话人分离功能

## 开发提示

- 后端 API 文档: `http://localhost:8000/docs` (FastAPI 自动生成的 Swagger 文档)
- 前端热重载: 修改前端代码会自动刷新浏览器
- 后端热重载: 修改后端代码会自动重启服务（使用--reload 参数）
