const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

let ws;

startBtn.onclick = async () => {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Relative WebSocket path (works on Render and localhost)
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  statusEl.textContent = "Connecting...";

  ws.onopen = async () => {
    statusEl.textContent = "Connected. Listening...";

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
      }
      ws.send(pcm.buffer);
    };

    ws.onmessage = (event) => {
      const audioData = event.data;
      const blob = new Blob([audioData], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    };
  };
};























