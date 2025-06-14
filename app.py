from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit
import asyncio
import websockets
import json
import base64
import os
import threading
import queue

app = Flask(__name__, static_folder='static')
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Get OpenAI API key from environment variable
OPENAI_API_KEY = os.getenv('OPEN_API_KEY')

if not OPENAI_API_KEY:
    raise ValueError("OPEN_API_KEY environment variable is required")

class OpenAIRealtimeClient:
    def __init__(self, api_key):
        self.api_key = api_key
        self.websocket = None
        self.audio_queue = queue.Queue()
        self.running = False

    async def connect(self):
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            self.websocket = await websockets.connect(
                "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
                extra_headers=headers
            )
            self.running = True
            
            # Send initial session configuration
            await self.send_session_update()
            
            # Start listening for messages
            await self.listen_for_messages()
            
        except Exception as e:
            print(f"Connection error: {e}")
            self.running = False

    async def send_session_update(self):
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": "You are a helpful AI assistant. Respond naturally in conversation.",
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
                    "silence_duration_ms": 200
                }
            }
        }
        await self.websocket.send(json.dumps(session_config))

    async def listen_for_messages(self):
        async for message in self.websocket:
            try:
                data = json.loads(message)
                await self.handle_openai_message(data)
            except Exception as e:
                print(f"Error handling message: {e}")

    async def handle_openai_message(self, data):
        message_type = data.get("type")
        
        if message_type == "response.audio.delta":
            # Forward audio data to client
            audio_data = data.get("delta", "")
            socketio.emit('audio_response', {'audio': audio_data})
            
        elif message_type == "response.text.delta":
            # Forward text data to client
            text_data = data.get("delta", "")
            socketio.emit('text_response', {'text': text_data})
            
        elif message_type == "conversation.item.input_audio_transcription.completed":
            # Forward transcription to client
            transcript = data.get("transcript", "")
            socketio.emit('transcription', {'text': transcript})
            
        elif message_type == "error":
            print(f"OpenAI API error: {data}")
            socketio.emit('error', {'message': data.get('error', {}).get('message', 'Unknown error')})

    async def send_audio(self, audio_data):
        if self.websocket and self.running:
            message = {
                "type": "input_audio_buffer.append",
                "audio": audio_data
            }
            await self.websocket.send(json.dumps(message))

    async def commit_audio(self):
        if self.websocket and self.running:
            message = {"type": "input_audio_buffer.commit"}
            await self.websocket.send(json.dumps(message))

    async def disconnect(self):
        self.running = False
        if self.websocket:
            await self.websocket.close()

# Global client instance
openai_client = None

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connected', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('start_conversation')
def handle_start_conversation():
    global openai_client
    
    def start_openai_connection():
        global openai_client
        openai_client = OpenAIRealtimeClient(OPENAI_API_KEY)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(openai_client.connect())
    
    # Start OpenAI connection in a separate thread
    thread = threading.Thread(target=start_openai_connection)
    thread.daemon = True
    thread.start()
    
    emit('conversation_started', {'message': 'Conversation started'})

@socketio.on('audio_data')
def handle_audio_data(data):
    global openai_client
    if openai_client and openai_client.running:
        audio_base64 = data['audio']
        
        def send_audio_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(openai_client.send_audio(audio_base64))
        
        thread = threading.Thread(target=send_audio_async)
        thread.daemon = True
        thread.start()

@socketio.on('audio_end')
def handle_audio_end():
    global openai_client
    if openai_client and openai_client.running:
        def commit_audio_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(openai_client.commit_audio())
        
        thread = threading.Thread(target=commit_audio_async)
        thread.daemon = True
        thread.start()

@socketio.on('stop_conversation')
def handle_stop_conversation():
    global openai_client
    if openai_client:
        def disconnect_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(openai_client.disconnect())
        
        thread = threading.Thread(target=disconnect_async)
        thread.daemon = True
        thread.start()
        
        openai_client = None
    
    emit('conversation_stopped', {'message': 'Conversation stopped'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)










