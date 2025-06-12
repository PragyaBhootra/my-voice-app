from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import tempfile
import os
from pydantic import BaseModel

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    with open("static/index.html") as f:
        return HTMLResponse(f.read())

@app.post("/process")
async def process_audio(request: Request):
    try:
        # Receive audio blob
        audio_data = await request.body()
        
        # Transcribe
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(audio_data)
            transcript = client.audio.transcriptions.create(
                file=open(f.name, "rb"), 
                model="whisper-1"
            )
        
        # Get GPT response
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": transcript.text}]
        )
        reply = response.choices[0].message.content
        
        # Generate speech
        speech = client.audio.speech.create(
            model="tts-1", 
            voice="nova", 
            input=reply
        )
        
        return StreamingResponse(
            iter([speech.content]),
            media_type="audio/mpeg"
        )
        
    except Exception as e:
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)


