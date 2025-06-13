class VoiceAssistant {
    constructor() {
        this.recordBtn = document.getElementById('recordBtn');
        this.chatHistory = document.getElementById('chatHistory');
        this.status = document.getElementById('status');
        this.responseAudio = document.getElementById('responseAudio');

        this.vad = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioContext = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.recordBtn.addEventListener('click', () => this.toggleVAD());
    }

    async toggleVAD() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.initializeVAD();
        }
    }

    async initializeVAD() {
        try {
            this.status.textContent = '🚀 Initializing voice engine...';
            this.recordBtn.disabled = true;

            // Dynamically load required libraries
            if (!window.ort || !window.vad) {
                await this.loadDependencies();
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    noiseSuppression: true,
                    echoCancellation: true
                }
            });

            this.vad = await vad.MicVAD.new({
                stream,
                onSpeechStart: () => this.handleSpeechStart(stream),
                onSpeechEnd: (audio) => this.handleSpeechEnd(audio),
                onError: (err) => this.showError(`VAD Error: ${err.message}`)
            });

            this.vad.start();
            this.isRecording = true;
            this.recordBtn.textContent = 'Stop Session';
            this.recordBtn.disabled = false;
            this.status.textContent = '👂 Ready - Speak now';

        } catch (err) {
            this.showError(`Initialization failed: ${err.message}`);
            this.recordBtn.disabled = false;
            console.error(err);
        }
    }

    async loadDependencies() {
        const dependencies = [
            'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.js',
            'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@latest/dist/bundle.min.js'
        ];

        for (const url of dependencies) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Failed to load ${url}`));
                document.head.appendChild(script);
            });
        }
    }

    handleSpeechStart(stream) {
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(stream);
        
        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };

        this.mediaRecorder.start();
        this.status.textContent = '🎤 Listening...';
    }

    async handleSpeechEnd(audio) {
        this.mediaRecorder?.stop();
        await this.processAudio(audio);
    }

    async stopRecording() {
        try {
            if (this.mediaRecorder?.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.vad?.stop();
            this.cleanupResources();
            
            this.status.textContent = '🛑 Stopped';
            this.recordBtn.textContent = 'Start Session';
            this.isRecording = false;

        } catch (err) {
            this.showError(`Stop failed: ${err.message}`);
        }
    }

    cleanupResources() {
        this.mediaRecorder?.stream?.getTracks().forEach(track => track.stop());
        this.mediaRecorder = null;
        this.audioChunks = [];
    }

    async processAudio(audioData) {
        try {
            this.status.textContent = '🔄 Processing...';
            
            // Convert Float32Array to WAV
            const wavBuffer = this.float32ToWav(audioData);
            const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });

            // Transcribe
            const transcription = await this.transcribeAudio(audioBlob);
            this.addMessage(transcription, 'user');

            // Get AI response
            const aiResponse = await this.getAIResponse(transcription);
            this.addMessage(aiResponse, 'ai');

            // Convert response to speech
            await this.speakResponse(aiResponse);

            this.status.textContent = '✅ Ready';
            
        } catch (err) {
            this.showError(`Processing failed: ${err.message}`);
            this.status.textContent = '❌ Error - Try Again';
            console.error(err);
        }
    }

    float32ToWav(buffer) {
        const WAV_HEADER_SIZE = 44;
        const bufferLength = buffer.length;
        const arrayBuffer = new ArrayBuffer(WAV_HEADER_SIZE + bufferLength * 2);
        const view = new DataView(arrayBuffer);

        // Write WAV header
        this.writeWavHeader(view, bufferLength * 2);

        // Write PCM data
        const offset = WAV_HEADER_SIZE;
        for (let i = 0; i < bufferLength; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return arrayBuffer;
    }

    writeWavHeader(view, dataLength) {
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        const sampleRate = 16000;
        const channelCount = 1;
        const byteRate = sampleRate * channelCount * 2;

        writeString(0, 'RIFF');
        view.setUint32(4, dataLength + 36, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, channelCount * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);
    }

    async transcribeAudio(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.wav');

            const response = await fetch('/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json().then(data => data.transcription);

        } catch (err) {
            throw new Error(`Transcription failed: ${err.message}`);
        }
    }

    async getAIResponse(message) {
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json().then(data => data.response);

        } catch (err) {
            throw new Error(`AI response failed: ${err.message}`);
        }
    }

    async speakResponse(text) {
        try {
            const response = await fetch('/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            this.responseAudio.src = audioUrl;
            
            await new Promise((resolve) => {
                this.responseAudio.onended = resolve;
                this.responseAudio.play();
            });

        } catch (err) {
            throw new Error(`Speech synthesis failed: ${err.message}`);
        }
    }

    addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="sender">${sender.toUpperCase()}</span>
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="message-content">${content}</div>
        `;
        this.chatHistory.appendChild(messageDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <span class="error-icon">⚠️</span>
            ${message}
        `;
        this.chatHistory.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.classList.add('fade-out');
            setTimeout(() => errorDiv.remove(), 300);
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => new VoiceAssistant());




















