import os
import asyncio
import websockets
import openai
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

openai.api_key = os.environ["OPENAI_API_KEY"]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html") as f:
        return f.read()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        async with websockets.connect(
            "wss://api.openai.com/v1/audio/speech/generation",
            extra_headers={"Authorization": f"Bearer {openai.api_key}"},
        ) as openai_ws:
            
            async def to_openai():
                while True:
                    audio = await websocket.receive_bytes()
                    await openai_ws.send(audio)

            async def from_openai():
                while True:
                    response = await openai_ws.recv()
                    await websocket.send_bytes(response)

            await asyncio.gather(to_openai(), from_openai())

    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()










