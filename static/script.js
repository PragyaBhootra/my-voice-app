let vad;
let isListening = false;
const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');

async function initVAD() {
  try {
    vad = await VAD.MicVAD.new({
      onSpeechStart: () => {
        micBtn.classList.add('active');
        statusEl.textContent = "Listening...";
      },
      onSpeechEnd: async (audio) => {
        micBtn.classList.remove('active');
        statusEl.textContent = "Processing...";
        await processAudio(audio);
      }
    });
    statusEl.textContent = "Ready - Start speaking!";
  } catch (error) {
    statusEl.textContent = "Microphone access required";
    console.error('VAD init error:', error);
  }
}

async function processAudio(audioData) {
  try {
    const audioBlob = new Blob([audioData], { type: 'audio/wav' });
    
    const response = await fetch('/process', {
      method: 'POST',
      body: audioBlob
    });

    if (!response.ok) throw new Error('Server error');
    
    const audioUrl = URL.createObjectURL(await response.blob());
    audioPlayer.src = audioUrl;
    audioPlayer.hidden = false;
    await audioPlayer.play();
    
    statusEl.textContent = "Ready - Start speaking!";
  } catch (error) {
    statusEl.textContent = "Error processing request";
    console.error('Processing error:', error);
  }
}

micBtn.addEventListener('click', async () => {
  if (!isListening) {
    isListening = true;
    statusEl.textContent = "Initializing...";
    await initVAD();
    if (vad) vad.start();
  } else {
    isListening = false;
    if (vad) vad.stop();
    statusEl.textContent = "Click microphone to start";
  }
});





