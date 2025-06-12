from openai import OpenAI
import gradio as gr
import tempfile
import os
import time

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Custom VAD JavaScript for automatic recording control
vad_script = """
<script src="https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.7/dist/bundle.min.js"></script>
<script>
async function initVAD() {
    const myvad = await VAD.create();
    const startButton = document.querySelector('.start-button');
    const stopButton = document.querySelector('.stop-button');
    
    myvad.on('start', () => {
        startButton.click();
        stopButton.style.display = 'none';
    });
    
    myvad.on('end', async () => {
        stopButton.click();
        startButton.style.display = 'none';
        await new Promise(r => setTimeout(r, 1000));
        myvad.start();
    });
    
    myvad.start();
}
initVAD();
</script>
"""

def transcribe_and_respond(audio_path, history=[]):
    try:
        # Transcribe audio
        with open(audio_path, "rb") as f:
            transcript = client.audio.transcriptions.create(
                file=f, model="whisper-1"
            )
        user_text = transcript.text
        
        # Generate response
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": "You're a helpful assistant. Keep responses under 2 sentences."}] 
                      + history 
                      + [{"role": "user", "content": user_text}]
        )
        reply = response.choices[0].message.content
        
        # Generate speech
        speech = client.audio.speech.create(
            model="tts-1", voice="nova", input=reply
        )
        
        # Save response audio
        response_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        with open(response_path, "wb") as f:
            f.write(speech.read())
            
        return response_path, history + [("", reply)]
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return None, history

# Gradio interface with VAD integration
with gr.Blocks(js=vad_script) as demo:
    with gr.Row():
        with gr.Column():
            audio_input = gr.Audio(
                sources=["microphone"],
                type="filepath",
                streaming=True,
                show_label=False
            )
        with gr.Column():
            response_audio = gr.Audio(
                autoplay=True,
                streaming=True,
                show_label=False
            )
    
    chat_history = gr.Chatbot(height=300)
    state = gr.State([])
    
    audio_input.stream(
        transcribe_and_respond,
        [audio_input, state],
        [response_audio, state],
        show_progress="hidden"
    )

# For Render deployment
app = gr.mount_gradio_app(
    app=gr.routes.App(),
    blocks=demo,
    path="/"
)
