class VoiceAssistant {
    constructor() {
        this.statusEl = document.getElementById('status');
        this.messagesEl = document.getElementById('messages');
        this.audioPlayer = document.getElementById('player');
        this.audioChunks = [];
        this.mediaRecorder = null;
        this.isRecording = false;
        this.initVAD();
    }

    async initVAD() {
        try {
            // Request mic permission up front
            await navigator.mediaDevices.getUserMedia({ audio: true });
            this.statusEl.textContent = "Ready to listen...";
            this.vad = await VAD.MicVAD.new({
                onSpeechStart: () => {
                    this.statusEl.textContent = "🎤 Listening...";
                    this.startRecording();
                },
                onSpeechEnd: async (audio) => {
                    this.statusEl.textContent = "⏳ Processing...";
                    await this.stopRecording();
                    await this.processAudio();
                }
            });
            this.vad.start();
        } catch (err) {
            this.statusEl.textContent = "❌ Microphone access denied or unavailable";
            console.error(err);
        }
    }

    startRecording() {
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.vad.stream);
        this.mediaRecorder.ondataavailable = e => this.audioChunks.push(e.data);
        this.mediaRecorder.start();
        this.isRecording = true;
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        // Display user message (optional, you can add transcription here)
        this.addMessage("⏳ Processing your speech...", "user");
        try {
            const response = await fetch('/process', {
                method: 'POST',
                body: audioBlob
            });
            if (!response.ok) throw new Error('Server error');
            const audioUrl = URL.createObjectURL(await response.blob());
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.hidden = false;
            this.audioPlayer.play();
            this.addMessage("✅ Response ready. Playing audio...", "ai");
            this.statusEl.textContent = "Ready to listen...";
        } catch (err) {
            this.statusEl.textContent = "❌ Error processing audio";
            this.addMessage("❌ Error: " + err.message, "ai");
        }
    }

    addMessage(text, sender) {
        const div = document.createElement('div');
        div.textContent = text;
        div.style.margin = "0.5rem 0";
        div.style.color = sender === "user" ? "#007bff" : "#28a745";
        this.messagesEl.appendChild(div);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});


