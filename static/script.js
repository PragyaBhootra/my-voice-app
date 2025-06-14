class RealtimeVoiceAssistant {
    constructor() {
        this.websocket = null;
        this.audioContext = null;
        this.isConnected = false;
        this.isRecording = false;
        this.audioQueue = [];
        this.audioWorkletSupported = false;

        // UI Elements
        this.startBtn = document.getElementById('startBtn');
        this.statusEl = document.getElementById('status');
        this.chatHistory = document.getElementById('chatHistory');
        this.canvas = document.getElementById('audioVisualization');
        this.canvasCtx = this.canvas.getContext('2d');

        this.initializeEventListeners();
    }

    async initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.toggleConnection());
    }

    async toggleConnection() {
        if (!this.isConnected) {
            await this.connect();
        } else {
            this.disconnect();
        }
    }

    async connect() {
        try {
            this.statusEl.textContent = "Connecting...";
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.websocket = new WebSocket(`${protocol}//${window.location.host}/ws`);

            this.websocket.onopen = async () => {
                this.isConnected = true;
                this.updateUI("🛑 Stop Chat", "Connected! Initializing audio...");
                await this.initializeAudioContext();
                await this.setupAudioStream();
            };

            this.websocket.onmessage = (event) => this.handleRealtimeEvent(JSON.parse(event.data));
            this.websocket.onclose = () => this.handleDisconnect();
            this.websocket.onerror = (error) => this.handleError(error);

        } catch (error) {
            console.error('Connection failed:', error);
            this.statusEl.textContent = "Connection failed";
        }
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000,
                latencyHint: 'interactive'
            });
            
            if (this.audioContext.audioWorklet) {
                await this.audioContext.audioWorklet.addModule('audio-processor.js');
                this.audioWorkletSupported = true;
            }
            
        } catch (error) {
            console.error('AudioContext initialization failed:', error);
            throw error;
        }
    }

    async setupAudioStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: false
                },
                video: false
            });

            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            this.visualizeAudio(analyser);

            this.setupAudioProcessing(source);
            this.updateUI("🎤 Listening...", "speak naturally");

        } catch (error) {
            console.error('Audio setup failed:', error);
            this.statusEl.textContent = "Microphone access required";
        }
    }

    setupAudioProcessing(source) {
        if (this.audioWorkletSupported) {
            const workletProcessor = new AudioWorkletNode(this.audioContext, 'audio-processor');
            source.connect(workletProcessor);
            workletProcessor.port.onmessage = (event) => this.handleAudioData(event.data);
            workletProcessor.connect(this.audioContext.destination);
        } else {
            const processor = this.audioContext.createScriptProcessor(1024, 1, 1);
            source.connect(processor);
            processor.connect(this.audioContext.destination);
            processor.onaudioprocess = (event) => {
                this.handleAudioData(event.inputBuffer.getChannelData(0));
            };
        }
    }

    handleAudioData(audioData) {
        if (!this.isRecording || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
            int16Array[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
        }
        
        this.websocket.send(JSON.stringify({
            type: "audio_data",
            audio: this.arrayBufferToBase64(int16Array.buffer)
        }));
    }

    async processAudioQueue() {
        if (this.playingAudio || !this.audioQueue.length) return;

        try {
            const base64Audio = this.audioQueue.shift();
            const pcm16 = new Int16Array(this.base64ToArrayBuffer(base64Audio));
            const float32 = new Float32Array(pcm16.length);

            const scaleFactor = 1 / (this.audioContext.sampleRate === 48000 ? 32768 : 32767);
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] * scaleFactor;
            }

            const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.audioContext.sampleRate);
            audioBuffer.copyToChannel(float32, 0);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start(0);

            source.onended = () => {
                this.playingAudio = false;
                this.processAudioQueue();
            };

            this.playingAudio = true;

        } catch (error) {
            console.error('Audio playback error:', error);
            this.playingAudio = false;
        }
    }

    // Helper methods
    arrayBufferToBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    visualizeAudio(analyser) {
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            analyser.getByteTimeDomainData(dataArray);
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvasCtx.strokeStyle = '#00ffff';
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.beginPath();

            const sliceWidth = this.canvas.width / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = this.canvas.height / 2 + v * this.canvas.height / 4;
                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            this.canvasCtx.stroke();
            requestAnimationFrame(draw);
        };
        draw();
    }

    // Remaining UI and WebSocket handlers
    handleRealtimeEvent(event) {
        switch (event.type) {
            case 'response.audio.delta':
                this.audioQueue.push(event.delta);
                this.processAudioQueue();
                break;
            // Other event handlers...
        }
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
        this.playingAudio = false;
        this.audioQueue = [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RealtimeVoiceAssistant();
});






















