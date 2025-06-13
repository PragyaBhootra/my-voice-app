from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import tempfile
import os
import json
import base64
import asyncio
import wave
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def create_wav(buffer: bytes) -> str:
    """Create WAV file from PCM16 data"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        with wave.open(f.name, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(buffer)
        return f.name

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    buffer = bytearray()
    
    try:
        while True:
            data = await websocket.receive_text()
            event = json.loads(data)

            if event["type"] == "audio_data":
                buffer.extend(base64.b64decode(event["audio"]))
                
            elif event["type"] == "audio_end":
                if not buffer:
                    await websocket.send_json({"type": "error", "error": "No audio received"})
                    continue

                try:
                    # Transcribe audio
                    wav_path = create_wav(bytes(buffer))
                    transcript = client.audio.transcriptions.create(
                        file=open(wav_path, "rb"),
                        model="whisper-1"
                    )
                    os.unlink(wav_path)
                    
                    await websocket.send_json({
                        "type": "transcription",
                        "text": transcript.text
                    })

                    # Generate response
                    response = client.chat.completions.create(
                        model="gpt-4o",
                        messages=[{
                            "role": "system",
                            "content": "You are a helpful voice assistant. Keep responses natural and concise."
                        }, {
                            "role": "user",
                            "content": transcript.text
                        }]
                    )
                    reply = response.choices[0].message.content

                    # Stream response
                    for chunk in [reply[i:i+20] for i in range(0, len(reply), 20)]:
                        await websocket.send_json({
                            "type": "response_text",
                            "text": chunk
                        })
                        await asyncio.sleep(0.1)

                    # Generate speech
                    speech = client.audio.speech.create(
                        model="tts-1-hd",
                        voice="nova",
                        input=reply,
                        response_format="mp3"
                    )
                    await websocket.send_json({
                        "type": "response_audio",
                        "audio": base64.b64encode(speech.content).decode()
                    })

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Processing error: {str(e)}"
                    })
                finally:
                    buffer.clear()

    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)








