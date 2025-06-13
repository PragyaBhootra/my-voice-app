class VoiceAssistant {
    constructor() {
        this.recordBtn = document.getElementById('recordBtn');
        this.chatHistory = document.getElementById('chatHistory');
        this.status = document.getElementById('status');
        this.responseAudio = document.getElementById('responseAudio');

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.vad = null;
        this.stream = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.recordBtn.addEventListener('click', () => this.initializeVAD());
    }

    async initializeVAD() {
        if (this.isRecording) return;

        this.recordBtn.disabled = true;
        this.status.textContent = 'Initializing voice detection...';

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.vad = await MicVAD.new({
                stream: this.stream,
                onSpeechStart: () => this.startRecording(),
                onSpeechEnd: () => this.stopRecording(),
            });

            this.vad.start();
            this.status.textContent = '🎤 Listening... Speak when ready';

        } catch (err) {
            this.showError('Failed to initialize microphone or VAD');
            console.error(err);
        }
    }

    startRecording() {
        if (this.isRecording) return;

        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.mediaRecorder.ondataavailable = (event) => this.audioChunks.push(event.data);
        this.mediaRecorder.onstop = () => this.processAudio();

        this.mediaRecorder.start();
        this.isRecording = true;

        this.status.textContent = '🎙️ Recording...';
        this.status.classList.add('recording');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.mediaRecorder.stop();
        this.isRecording = false;

        this.status.textContent = '🔄 Processing...';
        this.status.classList.remove('recording');
        this.status.classList.add('processing');

        this.vad.stop();
        this.stream.getTracks().forEach(track => track.stop());
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });

        try {
            const transcription = await this.transcribeAudio(audioBlob);
            this.addMessage(transcription, 'user');

            const aiResponse = await this.getAIResponse(transcription);
            this.addMessage(aiResponse, 'ai');

            await this.speakResponse(aiResponse);

            this.status.textContent = 'Ready for next voice command';
            this.status.classList.remove('processing');
            this.recordBtn.disabled = false;

        } catch (err) {
            this.showError('Processing error: ' + err.message);
            this.status.textContent = 'Error, try again';
            this.status.classList.remove('processing');
            this.recordBtn.disabled = false;
        }
    }

    async transcribeAudio(audioBlob) {
        const response = await fetch('/transcribe', {
            method: 'POST',
            body: audioBlob
        });

        if (!response.ok) throw new Error('Transcription failed');
        const data = await response.json();
        return data.transcription;
    }

    async getAIResponse(message) {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (!response.ok) throw new Error('AI response failed');
        const data = await response.json();
        return data.response;
    }

    async speakResponse(text) {
        const response = await fetch('/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        if (!response.ok) throw new Error('Speech synthesis failed');
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        this.responseAudio.src = audioUrl;
        this.responseAudio.play();
    }

    addMessage(message, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}-message`;
        div.textContent = message;
        this.chatHistory.appendChild(div);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    showError(message) {
        const div = document.createElement('div');
        div.className = 'error';
        div.textContent = message;
        this.chatHistory.appendChild(div);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        setTimeout(() => div.remove(), 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => new VoiceAssistant());



















