class RealtimeVoiceAssistant {
    constructor() {
        this.websocket = null;
        this.audioContext = null;
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
                this.cleanupAudio();
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

            const source = this.audioContext.createMediaStreamSource(stream);

            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            this.visualizeAudio(analyser);

            this.isRecording = true;
            this.statusEl.textContent = "🎤 Listening... (speak naturally)";
            this.sendAudioChunks(source);

        } catch (error) {
            console.error('Audio setup failed:', error);
            this.statusEl.textContent = "Microphone access required";
        }
    }

    sendAudioChunks(source) {
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(this.audioContext.destination);

        processor.onaudioprocess = (event) => {
            if (this.isRecording && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const audioData = event.inputBuffer.getChannelData(0);
                const int16Array = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    int16Array[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
                }
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
                this.websocket.send(JSON.stringify({
                    type: "audio_data",
                    audio: base64Audio
                }));
            }
        };
    }

    visualizeAudio(analyser) {
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            analyser.getByteTimeDomainData(dataArray);
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvasCtx.strokeStyle = '#00ffff';
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.beginPath();

            const sliceWidth = this.canvas.width / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = this.canvas.height / 2 + v * this.canvas.height / 4;
                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            this.canvasCtx.stroke();
            requestAnimationFrame(draw);
        };
        draw();
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
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);

             for (let i = 0; i < pcm16.length; i++) {
                 float32[i] = pcm16[i] / 32768;
            }

            const audioBuffer = this.audioContext.createBuffer(1, float32.length, 16000);
            audioBuffer.copyToChannel(float32, 0);
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();


        } catch (error) {
            console.error('Audio playback error:', error);
        }
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
        this.cleanupAudio();
    }

    cleanupAudio() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new RealtimeVoiceAssistant();
});























