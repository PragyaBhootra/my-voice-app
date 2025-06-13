class RealtimeVoiceAssistant {
    constructor() {
        this.websocket = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioQueue = [];
        this.isConnected = false;
        this.isRecording = false;
        
        this.startBtn = document.getElementById('startBtn');
        this.statusEl = document.getElementById('status');
        this.chatHistory = document.getElementById('chatHistory');
        this.canvas = document.getElementById('audioVisualization');
        this.canvasCtx = this.canvas.getContext('2d');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => {
            if (!this.isConnected) {
                this.connect();
            } else {
                this.disconnect();
            }
        });
    }

    async connect() {
        try {
            this.statusEl.textContent = "Connecting...";
            
            // Connect WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = async () => {
                this.isConnected = true;
                this.startBtn.textContent = "🛑 Stop Chat";
                this.statusEl.textContent = "Connected! Setting up audio...";
                await this.setupAudio();
            };

            this.websocket.onmessage = (event) => {
                this.handleRealtimeEvent(JSON.parse(event.data));
            };

            this.websocket.onclose = () => {
                this.isConnected = false;
                this.startBtn.textContent = "🚀 Start Realtime Chat";
                this.statusEl.textContent = "Disconnected";
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.statusEl.textContent = "Connection error";
            };

        } catch (error) {
            console.error('Connection failed:', error);
            this.statusEl.textContent = "Failed to connect";
        }
    }

    async setupAudio() {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Setup audio processing
            const source = this.audioContext.createMediaStreamSource(stream);
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (event) => {
                if (this.isRecording) {
                    const audioData = event.inputBuffer.getChannelData(0);
                    this.sendAudioData(audioData);
                    this.visualizeAudio(audioData);
                }
            };

            source.connect(processor);
            processor.connect(this.audioContext.destination);

            this.statusEl.textContent = "Ready - Start speaking!";
            this.startRecording();

        } catch (error) {
            console.error('Audio setup failed:', error);
            this.statusEl.textContent = "Microphone access required";
        }
    }

    startRecording() {
        this.isRecording = true;
        this.statusEl.textContent = "🎤 Listening... (speak naturally)";
    }

    stopRecording() {
        this.isRecording = false;
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ type: "audio_end" }));
        }
    }

    sendAudioData(audioData) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            // Convert Float32Array to Int16Array
            const int16Array = new Int16Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                int16Array[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
            }
            
            // Convert to base64
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
            
            this.websocket.send(JSON.stringify({
                type: "audio_data",
                audio: base64Audio
            }));
        }
    }

    handleRealtimeEvent(event) {
        console.log('Received event:', event.type);
        
        switch (event.type) {
            case 'session.created':
                this.addMessage("Session started successfully", "system");
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                this.addMessage(event.transcript, "user");
                break;
                
            case 'response.text.delta':
                this.appendToLastMessage(event.delta, "ai");
                break;
                
            case 'response.audio.delta':
                this.playAudioDelta(event.delta);
                break;
                
            case 'response.done':
                this.statusEl.textContent = "🎤 Listening... (speak naturally)";
                break;
                
            case 'error':
                this.addMessage(`Error: ${event.error.message}`, "error");
                break;
        }
    }

    playAudioDelta(base64Audio) {
        try {
            // Decode base64 audio
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert to AudioBuffer and play
            this.audioContext.decodeAudioData(bytes.buffer).then(audioBuffer => {
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.audioContext.destination);
                source.start();
            });
        } catch (error) {
            console.error('Audio playback error:', error);
        }
    }

    visualizeAudio(audioData) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.canvasCtx.clearRect(0, 0, width, height);
        this.canvasCtx.strokeStyle = '#00ffff';
        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.beginPath();
        
        const sliceWidth = width / audioData.length;
        let x = 0;
        
        for (let i = 0; i < audioData.length; i++) {
            const v = audioData[i] * 200;
            const y = height / 2 + v;
            
            if (i === 0) {
                this.canvasCtx.moveTo(x, y);
            } else {
                this.canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.canvasCtx.stroke();
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.textContent = text;
        this.chatHistory.appendChild(messageDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    appendToLastMessage(text, sender) {
        const messages = this.chatHistory.querySelectorAll(`.${sender}-message`);
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            lastMessage.textContent += text;
        } else {
            this.addMessage(text, sender);
        }
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    disconnect() {
        this.isRecording = false;
        if (this.websocket) {
            this.websocket.close();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new RealtimeVoiceAssistant();
});







