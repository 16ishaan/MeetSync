export function createSpeechSession({ Recognition, language, onText, onState, onError }) {
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  let disposed = false;
  recognition.onstart = () => { if (!disposed) onState('listening'); };
  recognition.onresult = (event) => {
    if (disposed) return;
    const final = [];
    const interim = [];
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      (result.isFinal ? final : interim).push(result[0].transcript.trim());
    }
    onText(final.join(' '), interim.join(' '));
  };
  recognition.onerror = (event) => { if (!disposed) onError(event.error); };
  recognition.onend = () => { if (!disposed) onState('idle'); };
  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    dispose() {
      disposed = true;
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.abort();
    },
  };
}
