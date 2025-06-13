class VoiceAssistant {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.status = document.getElementById('status');
        this.chatHistory = document.getElementById('chatHistory');
        this.audioPlayer = document.getElementById('responseAudio');
        this.canvas = document.getElementById('audioVisualization');
        this.ctx = this.canvas.getContext('2d');

        this.websocket = null;
        this.audioContext = null;
        this.isActive = false;
        this.analyser = null;

        this.initialize();
    }

    initialize() {
        this.setupCanvas();
        this.startBtn.addEventListener('click', () => this.toggleSession());
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth * 0.8;
        this.canvas.height = 100;
    }

    async toggleSession() {
        this.isActive ? this.stopSession() : this.startSession();
    }

    async startSession() {
        this.isActive = true;
        this.startBtn.textContent = "🛑 Stop";
        this.status.textContent = "🎤 Listening...";
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupAudioProcessing(stream);
            this.connectWebSocket();
        } catch (error) {
            this.showError("Microphone access required");
        }
    }

    async setupAudioProcessing(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Audio visualization
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);
        this.visualizeAudio();

        // Audio processing
        const processorCode = `
            class AudioProcessor extends AudioWorkletProcessor {
                process(inputs) {
                    const input = inputs[0][0];
                    if (input) {
                        const pcm16 = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) {
                            const sample = Math.max(-1, Math.min(1, input[i]));
                            pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
                        }
                        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `;

        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(url);
        
        const processor = new AudioWorkletNode(this.audioContext, 'audio-processor');
        processor.port.onmessage = (e) => this.handleAudioData(e.data);
        source.connect(processor);
        processor.connect(this.audioContext.destination);
    }

    handleAudioData(audioData) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
            this.websocket.send(JSON.stringify({ type: "audio_data", audio: base64 }));
        }
    }

    visualizeAudio() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.isActive) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const barWidth = (this.canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const height = dataArray[i] / 2;
                this.ctx.fillStyle = `hsl(${i * 2}, 100%, 50%)`;
                this.ctx.fillRect(x, this.canvas.height - height, barWidth, height);
                x += barWidth + 1;
            }

            requestAnimationFrame(draw.bind(this));
        };

        draw();
    }

    connectWebSocket() {
        this.websocket = new WebSocket(`ws://${window.location.host}/ws`);
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'transcription':
                    this.addMessage(data.text, 'user');
                    break;
                case 'response_text':
                    this.appendMessage(data.text, 'ai');
                    break;
                case 'response_audio':
                    this.playAudio(data.audio);
                    break;
                case 'error':
                    this.showError(data.error);
                    break;
            }
        };
    }

    stopSession() {
        this.isActive = false;
        this.startBtn.textContent = "🚀 Start";
        this.status.textContent = "Ready";
        
        if (this.websocket) {
            this.websocket.send(JSON.stringify({ type: "audio_end" }));
            this.websocket.close();
        }
        
        this.audioContext?.close();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    playAudio(base64Data) {
        const audioBlob = this.base64ToBlob(base64Data, 'audio/mpeg');
        this.audioPlayer.src = URL.createObjectURL(audioBlob);
        this.audioPlayer.play();
    }

    addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}-message`;
        div.textContent = text;
        this.chatHistory.appendChild(div);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    appendMessage(text, sender) {
        const messages = this.chatHistory.getElementsByClassName(`${sender}-message`);
        if (messages.length > 0) {
            messages[messages.length - 1].textContent += text;
        } else {
            this.addMessage(text, sender);
        }
    }

    base64ToBlob(base64, type) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        return new Blob([new Uint8Array(byteNumbers)], { type });
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.chatHistory.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => new VoiceAssistant());


















