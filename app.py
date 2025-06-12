from openai import OpenAI
import gradio as gr
from gtts import gTTS
import tempfile
import os
from fastapi import FastAPI 

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))  # Use environment variable

def speech_to_speech(audio_path):
    try:
        # Step 1: Transcribe user input using Whisper
        with open(audio_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1"
            )
        user_text = transcript.text

        # Step 2: Generate a response using GPT-4o
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful voice assistant."},
                {"role": "user", "content": user_text}
            ]
        )
        reply = response.choices[0].message.content

        # Step 3: Convert GPT reply to speech using OpenAI's TTS
        speech_response = client.audio.speech.create(
            model="tts-1",  # or tts-1-hd
            voice="nova",   # or 'shimmer', 'echo', etc.
            input=reply
        )

        # Save the mp3 response
        tts_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        with open(tts_path, "wb") as f:
            f.write(speech_response.read())

        return tts_path, user_text, reply

    except Exception as e:
        return None, f"Error: {str(e)}", f"Error: {str(e)}"

interface = gr.Interface(
    fn=speech_to_speech,
    inputs=gr.Audio(sources=["microphone"], type="filepath", label="🎤 Speak Here"),
    outputs=[
        gr.Audio(label="🔊 GPT Response"),
        gr.Textbox(label="📜 Transcribed Input"),
        gr.Textbox(label="🤖 GPT Reply")
    ],
    title="🎙️ Voice Chat",
    description="Speak and get AI replies! Powered by Whisper + GPT-4o + gTTS"
)

app = FastAPI()
app = gr.mount_gradio_app(app, interface, path="/")
