document.addEventListener('DOMContentLoaded', () => {
  let vad;
  let isListening = false;
  const micBtn = document.getElementById('micBtn');
  const statusEl = document.getElementById('status');
  const audioPlayer = document.getElementById('audioPlayer');
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  let animationId;

  // Draw a simple waveform animation for feedback
  function drawWaveform(volume = 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 30 + volume * 20, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function animateWaveform() {
    let growing = true, volume = 0.2;
    function animate() {
      drawWaveform(volume);
      if (growing) {
        volume += 0.01;
        if (volume > 0.4) growing = false;
      } else {
        volume -= 0.01;
        if (volume < 0.2) growing = true;
      }
      animationId = requestAnimationFrame(animate);
    }
    animate();
  }

  function stopWaveform() {
    cancelAnimationFrame(animationId);
    drawWaveform(0);
  }

  async function initVADWithMic() {
    try {
      // Explicitly request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      vad = await VAD.MicVAD.new({
        stream: stream,
        onSpeechStart: () => {
          micBtn.classList.add('active');
          statusEl.textContent = "Listening...";
          animateWaveform();
        },
        onSpeechEnd: async (audio) => {
          micBtn.classList.remove('active');
          statusEl.textContent = "Processing...";
          stopWaveform();
          await processAudio(audio);
        }
      });
      statusEl.textContent = "Ready - Start speaking!";
      vad.start();
    } catch (error) {
      statusEl.textContent = "Microphone access required";
      stopWaveform();
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
      await initVADWithMic();
    } else {
      isListening = false;
      if (vad) vad.stop();
      stopWaveform();
      statusEl.textContent = "Click microphone to start";
    }
  });

  // Draw initial waveform
  drawWaveform(0);
});






