document.addEventListener('DOMContentLoaded', () => {
  let vad;
  let isListening = false;
  const startBtn = document.getElementById('startBtn');
  const statusEl = document.getElementById('status');
  const responseAudio = document.getElementById('responseAudio');
  const chatHistory = document.getElementById('chatHistory');

  async function initVAD() {
    try {
      // Explicitly request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use window.VAD to ensure compatibility
      vad = await window.VAD.MicVAD.new({
        stream: stream,
        onSpeechStart: () => {
          startBtn.classList.add('active');
          statusEl.textContent = "🎤 Listening...";
        },
        onSpeechEnd: async (audio) => {
          startBtn.classList.remove('active');
          statusEl.textContent = "⏳ Processing...";
          await processAudio(audio);
        }
      });

      statusEl.textContent = "Ready - Start speaking!";
      vad.start();
    } catch (error) {
      statusEl.textContent = "Microphone access required";
      console.error('VAD init error:', error);
    }
  }

  // Process audio: send to backend and handle response
  async function processAudio(audioData) {
    try {
      const audioBlob = new Blob([audioData], { type: 'audio/wav' });

      // Append user message to chat (optional, since no transcript yet)
      addMessage('You spoke (audio sent)', 'user');

      // Transcribe audio
      const transcriptionResponse = await fetch('/transcribe', {
        method: 'POST',
        body: audioBlob
      });

      if (!transcriptionResponse.ok) throw new Error('Transcription failed');
      const transcriptionData = await transcriptionResponse.json();
      const userText = transcriptionData.transcription;
      addMessage(userText, 'user');

      // Get AI response
      const chatResponse = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });

      if (!chatResponse.ok) throw new Error('AI response failed');
      const chatData = await chatResponse.json();
      const aiText = chatData.response;
      addMessage(aiText, 'ai');

      // Synthesize speech
      const speakResponse = await fetch('/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiText })
      });

      if (!speakResponse.ok) throw new Error('Speech synthesis failed');
      const audioBlobResponse = await speakResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlobResponse);
      responseAudio.src = audioUrl;
      responseAudio.hidden = false;
      responseAudio.play();

      statusEl.textContent = "Ready - Start speaking!";
    } catch (error) {
      showError('Error processing audio: ' + error.message);
      statusEl.textContent = "Ready - Start speaking!";
    }
  }

  // Add messages to chat history
  function addMessage(message, sender) {
    if (!chatHistory) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = message;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Show error messages
  function showError(message) {
    if (!chatHistory) return;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    chatHistory.appendChild(errorDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    setTimeout(() => { errorDiv.remove(); }, 5000);
  }

  // Start button event listener
  startBtn.addEventListener('click', async () => {
    if (!isListening) {
      isListening = true;
      statusEl.textContent = "Initializing microphone and VAD...";
      await initVAD();
    } else {
      isListening = false;
      if (vad) vad.stop();
      statusEl.textContent = "Click start to begin conversation";
    }
  });

  // Initial UI setup
  statusEl.textContent = "Click start to begin conversation";
});







