class RealtimeVoiceAssistant {
    constructor() {
        this.websocket = null;
        this.audioContext = null;
        this.isConnected = false;
        this.isRecording = false;
        this.mp3Encoder = null;
        this.mp3Chunks = [];

        this.startBtn = document.getElementById('startBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
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

        this.downloadBtn.addEventListener('click', () => {
            this.downloadConversation();
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
                this.downloadBtn.style.display = 'none';
                await this.setupAudio();
            };

            this.websocket.onmessage = (event) => {
                this.handleRealtimeEvent(JSON.parse(event.data));
            };

            this.websocket.onclose = () => {
                this.isConnected = false;
                this.startBtn.textContent = "🚀 Start Realtime Chat";
                this.statusEl.textContent = "Disconnected";
                this.downloadBtn.style.display = 'block';
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

            // Initialize MP3 encoder
            this.mp3Encoder = new lamejs.Mp3Encoder(1, 16000, 128); // Mono, 16kHz, 128kbps
            this.mp3Chunks = [];

            const source = this.audioContext.createMediaStreamSource(stream);

            // Visualization
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            this.visualizeAudio(analyser);

            // Audio data sending
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

    playAudioDelta(base64Audio) {
        try {
            // Decode base64 to PCM16
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert PCM16 to MP3
            const pcmData = new Int16Array(bytes.buffer);
            const mp3Buffer = this.mp3Encoder.encodeBuffer(pcmData);
            this.mp3Chunks.push(mp3Buffer);

            // Play MP3
            const mp3Blob = new Blob([mp3Buffer], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(mp3Blob);
            const audioElement = new Audio(audioUrl);
            audioElement.play();

        } catch (error) {
            console.error('Audio playback error:', error);
        }
    }

    downloadConversation() {
        if (this.mp3Chunks.length === 0) return;

        // Flush remaining MP3 data
        const finalBuffer = this.mp3Encoder.flush();
        if (finalBuffer.length > 0) {
            this.mp3Chunks.push(finalBuffer);
        }

        // Combine all chunks
        const fullMP3 = new Uint8Array(
            this.mp3Chunks.reduce((acc, chunk) => {
                acc.push(...chunk);
                return acc;
            }, [])
        );

        // Create download link
        const blob = new Blob([fullMP3], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'conversation.mp3';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ... [Keep other methods unchanged from previous version] ...
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new RealtimeVoiceAssistant();
});








