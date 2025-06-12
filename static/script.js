let vad, mediaRecorder, audioChunks = [];
let isStarted = false;

const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const audioPlayer = document.getElementById('player');
const startBtn = document.getElementById('startBtn');

startBtn.onclick = async () => {
    startBtn.disabled = true;
    statusEl.textContent = "Initializing microphone and VAD...";
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Prompt permission early
        vad = await VAD.MicVAD.new({
            onSpeechStart: () => {
                statusEl.textContent = "🎤 Listening...";
                startRecording();
            },
            onSpeechEnd: async (audio) => {
                statusEl.textContent = "⏳ Processing...";
                await stopRecording();
                await processAudio();
            }
        });
        await vad.start();
        statusEl.textContent = "Ready to listen. Start speaking!";
        isStarted = true;
    } catch (err) {
        statusEl.textContent = "❌ Microphone access denied or unavailable";
        startBtn.disabled = false;
    }
};

function startRecording() {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(vad.stream);
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.start();
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        await new Promise(resolve => {
            mediaRecorder.onstop = resolve;
            mediaRecorder.stop();
        });
    }
}

async function processAudio() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    addMessage("⏳ Processing your speech...", "user");
    try {
        const response = await fetch('/process', {
            method: 'POST',
            body: audioBlob
        });
        if (!response.ok) throw new Error('Server error');
        const audioUrl = URL.createObjectURL(await response.blob());
        audioPlayer.src = audioUrl;
        audioPlayer.hidden = false;
        audioPlayer.play();
        addMessage("✅ Response ready. Playing audio...", "ai");
        statusEl.textContent = "Ready to listen. Start speaking!";
    } catch (err) {
        statusEl.textContent = "❌ Error processing audio";
        addMessage("❌ Error: " + err.message, "ai");
    }
}

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.margin = "0.5rem 0";
    div.style.color = sender === "user" ? "#007bff" : "#28a745";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}



