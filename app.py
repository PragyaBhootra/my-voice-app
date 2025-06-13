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

app = FastAPI()

# CORS middleware for frontend-backend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.get("/", response_class=HTMLResponse)
async def get_home():
    with open("static/index.html", "r") as f:
        return HTMLResponse(f.read())

def write_wav(buffer: bytes, filename: str, sample_rate=16000):
    # Write PCM16 buffer to a WAV file
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit PCM
        wf.setframerate(sample_rate)
        wf.writeframes(buffer)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        buffer = bytearray()
        print("WebSocket connection established.")

        while True:
            data = await websocket.receive_text()
            event = json.loads(data)

            if event["type"] == "audio_data":
                audio_chunk = base64.b64decode(event["audio"])
                print(f"Received audio chunk: {len(audio_chunk)} bytes")
                buffer.extend(audio_chunk)

            elif event["type"] == "audio_end":
                print(f"Total audio buffer size: {len(buffer)} bytes")
                # Save full audio buffer to WAV file
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
                    write_wav(buffer, tmp_file.name, sample_rate=16000)
                    print(f"WAV file written: {tmp_file.name}")

                    # Transcribe audio
                    with open(tmp_file.name, "rb") as audio_file:
                        transcript = client.audio.transcriptions.create(
                            file=audio_file,
                            model="whisper-1"
                        )
                os.unlink(tmp_file.name)
                print(f"Transcript: {transcript.text}")

                # Send transcript back to client
                await websocket.send_json({
                    "type": "conversation.item.input_audio_transcription.completed",
                    "transcript": transcript.text
                })

                # Get text reply from GPT
                gpt_response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a helpful voice assistant. Keep responses concise."},
                        {"role": "user", "content": transcript.text}
                    ]
                )
                reply_text = gpt_response.choices[0].message.content

                # Stream GPT text response
                for word in reply_text.split():
                    await websocket.send_json({"type": "response.text.delta", "delta": word + " "})
                    await asyncio.sleep(0.05)

                # Convert to speech
                speech_response = client.audio.speech.create(
                    model="gpt-4o-mini-tts",
                    voice="nova",
                    input=reply_text
                )
                speech_bytes = speech_response.content

                # Encode audio as base64 PCM (simulate PCM16)
                audio_base64 = base64.b64encode(speech_bytes).decode("utf-8")
                await websocket.send_json({"type": "response.audio.delta", "delta": audio_base64})

                await websocket.send_json({"type": "response.done"})
                buffer.clear()

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print("Exception:", str(e))
        await websocket.send_json({"type": "error", "error": {"message": str(e)}})








