class VoiceChatApp {
    constructor() {
        this.socket = io();
        this.mediaRecorder = null;
        this.audioContext = null;
        this.isRecording = false;
        this.isConnected = false;
        this.audioChunks = [];
        
        this.initializeElements();
        this.initializeSocket();
        this.initializeAudio();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.recordBtn = document.getElementById('recordBtn');
        this.status = document.getElementById('status');
        this.transcription = document.getElementById('transcription');
        this.response = document.getElementById('response');
        
        this.startBtn.addEventListener('click', () => this.startConversation());
        this.stopBtn.addEventListener('click', () => this.stopConversation());
        this.recordBtn.addEventListener('mousedown', () => this.startRecording());
        this.recordBtn.addEventListener('mouseup', () => this.stopRecording());
        this.recordBtn.addEventListener('mouseleave', () => this.stopRecording());
        this.recordBtn.addEventListener('touchstart', () => this.startRecording());
        this.recordBtn.addEventListener('touchend', () => this.stopRecording());
    }

    initializeSocket() {
        this.socket.on('connected', (data) => {
            this.updateStatus('Connected to server');
        });

        this.socket.on('conversation_started', (data) => {
            this.isConnected = true;
            this.updateStatus('Conversation started - Hold the record button to speak');
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.recordBtn.disabled = false;
        });

        this.socket.on('conversation_stopped', (data) => {
            this.isConnected = false;
            this.updateStatus('Conversation stopped');
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.recordBtn.disabled = true;
        });

        this.socket.on('transcription', (data) => {
            this.transcription.innerHTML += `<div class="user-message">You: ${data.text}</div>`;
            this.transcription.scrollTop = this.transcription.scrollHeight;
        });

        this.socket.on('text_response', (data) => {
            this.response.innerHTML += data.text;
            this.response.scrollTop = this.response.scrollHeight;
        });

        this.socket.on('audio_response', (data) => {
            this.playAudioResponse(data.audio);
        });

        this.socket.on('error', (data) => {
            this.updateStatus(`Error: ${data.message}`);
        });
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processAudioData();
            };
            
            this.updateStatus('Microphone access granted');
        } catch (error) {
            this.updateStatus('Microphone access denied');
            console.error('Error accessing microphone:', error);
        }
    }

    startConversation() {
        this.socket.emit('start_conversation');
        this.updateStatus('Starting conversation...');
    }

    stopConversation() {
        this.socket.emit('stop_conversation');
        if (this.isRecording) {
            this.stopRecording();
        }
    }

    startRecording() {
        if (!this.isConnected || this.isRecording || !this.mediaRecorder) return;
        
        this.isRecording = true;
        this.audioChunks = [];
        this.recordBtn.classList.add('recording');
        this.recordBtn.textContent = 'Recording...';
        this.updateStatus('Listening...');
        
        this.mediaRecorder.start(100); // Collect data every 100ms
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');
        this.recordBtn.textContent = 'Hold to Speak';
        this.updateStatus('Processing...');
        
        this.mediaRecorder.stop();
    }

    async processAudioData() {
        if (this.audioChunks.length === 0) return;
        
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // Convert to PCM16 format
        const audioData = await this.convertToPCM16(arrayBuffer);
        const base64Audio = btoa(String.fromCharCode(...audioData));
        
        this.socket.emit('audio_data', { audio: base64Audio });
        this.socket.emit('audio_end');
        
        this.audioChunks = [];
    }

    async convertToPCM16(arrayBuffer) {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const sampleRate = 16000;
        const length = Math.floor(audioBuffer.length * sampleRate / audioBuffer.sampleRate);
        const result = new Int16Array(length);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < length; i++) {
            const index = Math.floor(i * audioBuffer.sampleRate / sampleRate);
            result[i] = Math.max(-32768, Math.min(32767, channelData[index] * 32768));
        }
        
        return new Uint8Array(result.buffer);
    }

    async playAudioResponse(base64Audio) {
        try {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error playing audio response:', error);
        }
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceChatApp();
});
























