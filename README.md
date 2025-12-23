# Azure Speech - 说话人分离项目

这是一个基于 React 前端和 FastAPI 后端的实时语音识别与说话人分离应用。

## 项目结构

```
speech_cn/
├── backend/              # 后端API服务
│   ├── api.py           # FastAPI应用，提供token获取接口
│   └── requirements.txt # Python依赖
├── frontend/            # React前端应用
│   ├── src/
│   │   ├── App.jsx      # 主应用组件
│   │   ├── services/
│   │   │   └── speechService.js  # Azure Speech SDK封装
│   │   └── ...
│   └── package.json     # Node.js依赖
├── main.py              # 原始Python CLI版本（保留）
└── .env                 # 环境变量配置（需要创建）
```

## 功能特性

- ✅ 实时语音识别（中文）
- ✅ 说话人分离（Speaker Diarization）
- ✅ 美观的 React 前端界面
- ✅ 后端 API 提供 token 获取
- ✅ 使用 Azure Speech 中国区域服务

## 环境要求

- Python 3.8+
- Node.js 16+
- Azure Speech 服务订阅密钥

## 安装步骤

### 1. 配置环境变量

创建 `.env` 文件（在项目根目录）：

```env
AZURE_SPEECH_SUBSCRIPTION_KEY=your_subscription_key
AZURE_SPEECH_TOKEN_ENDPOINT=https://your-region.api.cognitive.azure.cn/sts/v1.0/issueToken
AZURE_SPEECH_REGION=chinanorth3
```

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
# 或使用uv
uv pip install -r requirements.txt
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
# 或使用yarn
yarn install
```

## 运行项目

### 启动后端服务

```bash
cd backend
uvicorn api:app --reload --port 8000
```

后端 API 将在 `http://localhost:8000` 运行

### 启动前端应用

```bash
cd frontend
npm run dev
# 或
yarn dev
```

前端应用将在 `http://localhost:3000` 运行

## API 接口

### GET /api/token

获取 Azure Speech 访问 token

**响应:**

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "region": "chinanorth3"
}
```

### GET /api/health

健康检查接口

**响应:**

```json
{
  "status": "ok"
}
```

## 使用说明

1. 确保后端服务已启动
2. 打开浏览器访问前端应用（通常是 `http://localhost:3000`）
3. 点击"开始识别"按钮
4. 浏览器会请求麦克风权限，请允许
5. 开始说话，系统会自动识别并显示转录结果
6. 不同说话人的内容会以不同标签显示
7. 点击"停止识别"结束会话

## 技术栈

### 后端

- FastAPI - 现代 Python Web 框架
- Azure Speech SDK (Python) - 用于 token 获取

### 前端

- React 18 - UI 框架
- Vite - 构建工具
- Azure Speech SDK (JavaScript) - 语音识别 SDK
- Axios - HTTP 客户端

## 注意事项

1. **浏览器兼容性**: 需要支持 Web Audio API 和麦克风访问的现代浏览器
2. **HTTPS 要求**: 生产环境需要使用 HTTPS 才能访问麦克风
3. **CORS 配置**: 后端已配置 CORS，允许前端域名访问
4. **Token 有效期**: Azure Speech token 通常有效期为 10 分钟，SDK 会自动处理刷新

## 开发说明

### 原始 Python 版本

项目保留了原始的 Python CLI 版本 (`main.py`)，可以直接运行：

```bash
python main.py
```

### 前端开发

前端使用 Vite 作为开发服务器，支持热重载。

### 后端开发

后端使用 FastAPI，支持自动重载（使用 `--reload` 参数）。

## 许可证

MIT
