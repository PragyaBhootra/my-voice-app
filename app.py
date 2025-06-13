from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import tempfile
import os
import json
import base64
import asyncio
import wave
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def create_wav_file(buffer: bytes, sample_rate=16000) -> str:
    """Create a temporary WAV file with proper headers."""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            with wave.open(tmp_file.name, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit PCM
                wf.setframerate(sample_rate)
                wf.writeframes(buffer)
            return tmp_file.name
    except Exception as e:
        logger.error(f"Error creating WAV file: {str(e)}")
        raise

@app.get("/", response_class=HTMLResponse)
async def get_home():
    with open("static/index.html", "r") as f:
        return HTMLResponse(f.read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    buffer = bytearray()
    
    try:
        logger.info("WebSocket connection established")
        while True:
            data = await websocket.receive_text()
            event = json.loads(data)
            
            if event["type"] == "audio_data":
                # Handle audio chunks
                audio_chunk = base64.b64decode(event["audio"])
                buffer.extend(audio_chunk)
                logger.debug(f"Received audio chunk: {len(audio_chunk)} bytes")

            elif event["type"] == "audio_end":
                # Process complete audio input
                logger.info(f"Processing audio buffer ({len(buffer)} bytes)")
                
                if not buffer:
                    await websocket.send_json({
                        "type": "error",
                        "error": {"message": "Empty audio buffer received"}
                    })
                    continue
                
                try:
                    # Create valid WAV file
                    wav_path = create_wav_file(bytes(buffer))
                    logger.info(f"Created temporary WAV file: {wav_path}")

                    # Transcribe with Whisper
                    with open(wav_path, "rb") as audio_file:
                        transcript = client.audio.transcriptions.create(
                            file=audio_file,
                            model="whisper-1",
                            language="en"  # Optional: Set if you know the language
                        )
                    logger.info(f"Transcript: {transcript.text}")
                    
                    # Send transcript
                    await websocket.send_json({
                        "type": "conversation.item.input_audio_transcription.completed",
                        "transcript": transcript.text
                    })

                    # Generate GPT response
                    gpt_response = client.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content": "You are a helpful voice assistant. Keep responses concise."},
                            {"role": "user", "content": transcript.text}
                        ]
                    )
                    reply_text = gpt_response.choices[0].message.content

                    # Stream text response
                    for word in reply_text.split():
                        await websocket.send_json({
                            "type": "response.text.delta", 
                            "delta": word + " "
                        })
                        await asyncio.sleep(0.05)

                    # Generate and send TTS audio
                    speech_response = client.audio.speech.create(
                        model="tts-1-hd",
                        voice="nova",
                        input=reply_text,
                        response_format="mp3"
                    )
                    audio_base64 = base64.b64encode(speech_response.content).decode("utf-8")
                    await websocket.send_json({
                        "type": "response.audio.delta",
                        "delta": audio_base64
                    })

                    await websocket.send_json({"type": "response.done"})

                except Exception as e:
                    logger.error(f"Processing error: {str(e)}")
                    await websocket.send_json({
                        "type": "error",
                        "error": {"message": f"Processing failed: {str(e)}"}
                    })
                finally:
                    buffer.clear()
                    if os.path.exists(wav_path):
                        os.unlink(wav_path)

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket.send_json({
            "type": "error",
            "error": {"message": f"Server error: {str(e)}"}
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)








