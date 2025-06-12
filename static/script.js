class VoiceAssistant {
    constructor() {
        this.statusEl = document.getElementById('status')
        this.messagesEl = document.getElementById('messages')
        this.audioPlayer = document.getElementById('player')
        this.mediaRecorder = null
        this.audioChunks = []
        
        this.initVAD()
    }

    async initVAD() {
        this.vad = await VAD.MicVAD.new({
            onSpeechStart: () => {
                this.statusEl.textContent = "🎤 Listening..."
                this.startRecording()
            },
            onSpeechEnd: async (audio) => {
                this.statusEl.textContent = "⏳ Processing..."
                await this.processAudio(audio)
                this.statusEl.textContent = "✅ Ready"
            }
        })
        this.vad.start()
    }

    startRecording() {
        this.audioChunks = []
        this.mediaRecorder = new MediaRecorder(this.vad.stream)
        
        this.mediaRecorder.ondataavailable = e => {
            this.audioChunks.push(e.data)
        }
        
        this.mediaRecorder.start()
    }

    async processAudio() {
        this.mediaRecorder.stop()
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' })
        
        try {
            // Send to backend
            const response = await fetch('/process', {
                method: 'POST',
                body: audioBlob
            })
            
            // Play response
            const audioUrl = URL.createObjectURL(await response.blob())
            this.audioPlayer.src = audioUrl
            this.audioPlayer.play()
            
        } catch (e) {
            console.error('Error:', e)
            this.statusEl.textContent = "❌ Error processing request"
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant()
})

