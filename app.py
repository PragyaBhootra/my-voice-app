from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import os
import base64
import websockets
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
async def get_home():
    with open("static/index.html", "r") as f:
        return HTMLResponse(f.read())

class RealtimeClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.websocket = None
        self.url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "OpenAI-Beta": "realtime=v1"
        }

    async def connect(self):
        """Connect to OpenAI Realtime API"""
        try:
            self.websocket = await websockets.connect(
                self.url,
                additional_headers=self.headers
            )
            logger.info("Connected to OpenAI Realtime API")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to OpenAI: {e}")
            return False

    async def send_event(self, event):
        """Send event to OpenAI"""
        if self.websocket:
            await self.websocket.send(json.dumps(event))

    async def receive_event(self):
        """Receive event from OpenAI"""
        if self.websocket:
            try:
                message = await self.websocket.recv()
                return json.loads(message)
            except websockets.exceptions.ConnectionClosed:
                logger.info("OpenAI connection closed")
                return None
        return None

    async def close(self):
        """Close connection"""
        if self.websocket:
            await self.websocket.close()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Initialize OpenAI Realtime client
    openai_client = RealtimeClient(os.environ.get("OPENAI_API_KEY"))
    
    try:
        # Connect to OpenAI
        if not await openai_client.connect():
            await websocket.send_json({"type": "error", "message": "Failed to connect to OpenAI"})
            return

        # Configure session
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": "You are a helpful AI assistant. Keep responses conversational and concise.",
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                }
            }
        }
        await openai_client.send_event(session_config)

        # Handle concurrent message processing
        async def handle_openai_messages():
            """Forward OpenAI messages to client"""
            while True:
                try:
                    openai_event = await openai_client.receive_event()
                    if openai_event is None:
                        break
                    await websocket.send_json(openai_event)
                except Exception as e:
                    logger.error(f"Error handling OpenAI message: {e}")
                    break

        async def handle_client_messages():
            """Forward client messages to OpenAI"""
            while True:
                try:
                    client_message = await websocket.receive_json()
                    
                    if client_message["type"] == "audio_data":
                        # Convert client audio to OpenAI format
                        audio_event = {
                            "type": "input_audio_buffer.append",
                            "audio": client_message["audio"]
                        }
                        await openai_client.send_event(audio_event)
                    
                    elif client_message["type"] == "audio_end":
                        # Commit audio and request response
                        await openai_client.send_event({"type": "input_audio_buffer.commit"})
                        await openai_client.send_event({"type": "response.create"})
                    
                    elif client_message["type"] == "text_message":
                        # Handle text input
                        text_event = {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": client_message["text"]}]
                            }
                        }
                        await openai_client.send_event(text_event)
                        await openai_client.send_event({"type": "response.create"})
                    
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    logger.error(f"Error handling client message: {e}")
                    break

        # Run both handlers concurrently
        await asyncio.gather(
            handle_openai_messages(),
            handle_client_messages()
        )

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    
    finally:
        await openai_client.close()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)










