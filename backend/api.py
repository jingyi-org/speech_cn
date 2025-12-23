import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Azure Speech Token API")

# 配置CORS，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React默认端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TokenResponse(BaseModel):
    token: str
    region: str


@app.get("/api/token", response_model=TokenResponse)
async def get_token():
    """获取Azure Speech访问token"""
    subscription_key = os.getenv("AZURE_SPEECH_SUBSCRIPTION_KEY")
    token_endpoint = os.getenv("AZURE_SPEECH_TOKEN_ENDPOINT")
    region = os.getenv("AZURE_SPEECH_REGION", "chinanorth3")

    if not subscription_key or not token_endpoint:
        raise HTTPException(
            status_code=500,
            detail="Missing required environment variables: AZURE_SPEECH_SUBSCRIPTION_KEY or AZURE_SPEECH_TOKEN_ENDPOINT",
        )

    headers = {"Ocp-Apim-Subscription-Key": subscription_key}

    try:
        response = requests.post(token_endpoint, headers=headers)
        response.raise_for_status()
        token = response.text.strip()
        return TokenResponse(token=token, region=region)
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get access token: {str(e)}"
        )


@app.get("/api/health")
async def health():
    """健康检查接口"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
