class VoiceAssistant {
    constructor() {
        this.recordBtn = document.getElementById('recordBtn');
        this.chatHistory = document.getElementById('chatHistory');
        this.status = document.getElementById('status');
        this.responseAudio = document.getElementById('responseAudio');

        this.websocket = null;
        this.audioContext = null;
        this.processor = null;
        this.isSessionActive = false;
        this.isRecording = false;
        this.silenceTimeout = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.recordBtn.addEventListener('click', () => {
            if (!this.isSessionActive) {
                this.startSession();
            } else {
                this.stopSession();
            }
        });
    }

    async startSession() {
        this.isSessionActive = true;
        this.recordBtn.textContent = "🛑 Stop";
        this.status.textContent = '🎤 Listening...';
        this.status.classList.add('recording');
        this.status.classList.remove('processing');

        // Open WebSocket connection if not open
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            await this.openWebSocket();
        }

        // Start audio capture and VAD
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(stream);
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.processor.onaudioprocess = (e) => {
                if (!this.isSessionActive) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const isSilent = inputData.every(sample => Math.abs(sample) < 0.01);

                if (!isSilent) {
                    this.isRecording = true;
                    clearTimeout(this.silenceTimeout);

                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = s < 0 ? s * 32768 : s * 32767;
                    }
                    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        this.websocket.send(JSON.stringify({
                            type: "audio_data",
                            audio: base64Audio
                        }));
                    }
                }

                // If currently recording and now silent, start silence timer
                if (this.isRecording && isSilent && !this.silenceTimeout) {
                    this.silenceTimeout = setTimeout(() => {
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({ type: "audio_end" }));
                        }
                        this.isRecording = false;
                        this.status.textContent = "🔄 Processing...";
                        this.status.classList.remove('recording');
                        this.status.classList.add('processing');
                        this.silenceTimeout = null;
                    }, 1200); // 1.2s silence triggers "audio_end"
                }
            };

        } catch (error) {
            this.showError('Microphone access denied or not available');
            console.error('Error accessing microphone:', error);
        }
    }

    stopSession() {
        this.isSessionActive = false;
        this.isRecording = false;
        this.recordBtn.textContent = "🚀 Start";
        this.status.textContent = 'Session ended.';
        this.status.classList.remove('recording', 'processing');
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.close();
        }
        this.cleanupAudio();
    }

    async openWebSocket() {
        return new Promise((resolve, reject) => {
            this.websocket = new WebSocket((window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws');
            this.websocket.onopen = () => {
                this.websocket.onmessage = (event) => this.handleRealtimeEvent(JSON.parse(event.data));
                resolve();
            };
            this.websocket.onerror = (e) => {
                this.showError('WebSocket connection failed');
                reject(e);
            };
            this.websocket.onclose = () => {
                this.status.textContent = 'Disconnected';
                this.status.classList.remove('processing', 'recording');
            };
        });
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
                this.status.textContent = '🎤 Listening...';
                this.status.classList.remove('processing');
                break;
            case 'error':
                this.showError(event.error.message);
                this.status.textContent = 'Ready to listen...';
                this.status.classList.remove('processing', 'recording');
                break;
        }
    }

    async playAudio(base64Audio) {
        const audioBlob = base64ToBlob(base64Audio, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        this.responseAudio.src = audioUrl;
        this.responseAudio.play();
    }

    addMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.textContent = message;
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

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        this.chatHistory.appendChild(errorDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        setTimeout(() => errorDiv.remove(), 5000);
    }

    cleanupAudio() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        clearTimeout(this.silenceTimeout);
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
    new VoiceAssistant();
});


















