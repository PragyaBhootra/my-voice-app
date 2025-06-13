// script.js
class RealtimeVoiceAssistant {
    constructor() {
        this.websocket = null;
        this.audioContext = null;
        this.isConnected = false;
        this.isRecording = false;
        this.audioQueue = [];
        this.isPlaying = false;

        this.startBtn = document.getElementById('startBtn');
        this.statusEl = document.getElementById('status');
        this.chatHistory = document.getElementById('chatHistory');
        this.canvas = document.getElementById('audioVisualization');
        this.canvasCtx = this.canvas.getContext('2d');

        this.initializeEventListeners();
        this.setupCanvas();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth * 0.8;
        this.canvas.height = 100;
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
                this.startBtn.textContent = "🚀 Start Chat";
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
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(stream);
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(this.audioContext.destination);

            processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcm16[i] = inputData[i] * 32767;
                }
                
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                this.websocket.send(JSON.stringify({
                    type: "audio_data",
                    audio: base64Audio
                }));
            };

            // Visualization
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            this.visualizeAudio(analyser);

            this.isRecording = true;
            this.statusEl.textContent = "🎤 Listening... (speak naturally)";
        } catch (error) {
            console.error('Audio setup failed:', error);
            this.statusEl.textContent = "Microphone access required";
        }
    }

    visualizeAudio(analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            analyser.getByteFrequencyData(dataArray);
            
            this.canvasCtx.fillStyle = 'rgb(18, 18, 18)';
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const barWidth = (this.canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                this.canvasCtx.fillStyle = `rgb(0, ${barHeight + 100}, 255)`;
                this.canvasCtx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }

            requestAnimationFrame(draw);
        };
        draw();
    }

    handleRealtimeEvent(event) {
        switch (event.type) {
            case 'conversation.item.input_audio_transcription.completed':
                this.addMessage(event.transcript, "user");
                break;
            case 'response.text.delta':
                this.appendToLastMessage(event.delta, "ai");
                break;
            case 'response.audio.delta':
                this.playAudio(event.delta);
                break;
            case 'response.done':
                this.statusEl.textContent = "🎤 Listening... (speak naturally)";
                break;
            case 'error':
                this.addMessage(`Error: ${event.error.message}`, "error");
                break;
        }
    }

    async playAudio(base64Audio) {
        const audioBlob = base64ToBlob(base64Audio, 'audio/mpeg');
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        this.audioContext.decodeAudioData(arrayBuffer, (buffer) => {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
        });
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

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

document.addEventListener('DOMContentLoaded', () => {
    new RealtimeVoiceAssistant();
});















