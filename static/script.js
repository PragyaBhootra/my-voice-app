class VoiceAssistant {
    constructor() {
        this.recordBtn = document.getElementById('recordBtn');
        this.chatHistory = document.getElementById('chatHistory');
        this.status = document.getElementById('status');
        this.responseAudio = document.getElementById('responseAudio');
        
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Mouse events for desktop
        this.recordBtn.addEventListener('mousedown', () => this.startRecording());
        this.recordBtn.addEventListener('mouseup', () => this.stopRecording());
        this.recordBtn.addEventListener('mouseleave', () => this.stopRecording());
        
        // Touch events for mobile
        this.recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        this.recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });
    }

    async startRecording() {
        if (this.isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.processAudio();
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update UI
            this.recordBtn.classList.add('recording');
            this.status.textContent = '🎤 Recording... Release to send';
            this.status.classList.add('recording');

        } catch (error) {
            this.showError('Microphone access denied or not available');
            console.error('Error accessing microphone:', error);
        }
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;

        // Update UI
        this.recordBtn.classList.remove('recording');
        this.status.textContent = '🔄 Processing...';
        this.status.classList.remove('recording');
        this.status.classList.add('processing');
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        
        try {
            // Step 1: Transcribe audio
            const transcription = await this.transcribeAudio(audioBlob);
            this.addMessage(transcription, 'user');

            // Step 2: Get AI response
            const aiResponse = await this.getAIResponse(transcription);
            this.addMessage(aiResponse, 'ai');

            // Step 3: Convert to speech and play
            await this.speakResponse(aiResponse);

            this.status.textContent = 'Ready to listen...';
            this.status.classList.remove('processing');

        } catch (error) {
            this.showError('Error processing audio: ' + error.message);
            this.status.textContent = 'Ready to listen...';
            this.status.classList.remove('processing');
        }
    }

    async transcribeAudio(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob);

        const response = await fetch('/transcribe', {
            method: 'POST',
            body: audioBlob
        });

        if (!response.ok) {
            throw new Error('Transcription failed');
        }

        const data = await response.json();
        return data.transcription;
    }

    async getAIResponse(message) {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            throw new Error('AI response failed');
        }

        const data = await response.json();
        return data.response;
    }

    async speakResponse(text) {
        const response = await fetch('/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });

        if (!response.ok) {
            throw new Error('Speech synthesis failed');
        }

        const audioBlob = await response.blob();
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

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        
        this.chatHistory.appendChild(errorDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        
        // Remove error after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Initialize the voice assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});
