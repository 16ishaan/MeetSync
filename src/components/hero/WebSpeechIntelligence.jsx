import { useEffect, useRef, useState } from "react";
import { createSpeechSession } from "../../lib/speechRecognition";
import "./WebSpeechIntelligence.css";

const errors = {
  "not-allowed": "Microphone access was denied. Allow microphone access in your browser’s site settings, then try again.",
  "service-not-allowed": "Speech recognition is blocked by your browser. Try Chrome with microphone access enabled.",
  "audio-capture": "No microphone is available. Connect one and try again.",
  network: "The speech service could not connect. Check your internet connection and try again.",
  "no-speech": "No speech detected. Start again and speak near your microphone.",
  "language-not-supported": "This language is unavailable. Choose another language.",
};

export default function WebSpeechIntelligence() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(Recognition) && window.isSecureContext;
  const [language, setLanguage] = useState("en-IN");
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const sessionRef = useRef(null);
  const transcriptRef = useRef("");
  const active = status !== "idle";

  useEffect(() => () => sessionRef.current?.dispose(), []);

  const start = () => {
    if (!supported || active) return;
    sessionRef.current?.dispose();
    const previous = transcriptRef.current;
    setError("");
    setInterim("");
    setStatus("starting");
    const session = createSpeechSession({
      Recognition,
      language,
      onText: (final, pending) => {
        const text = [previous, final].filter(Boolean).join(" ");
        transcriptRef.current = text;
        setTranscript(text);
        setInterim(pending);
      },
      onState: (next) => {
        setStatus(next);
        if (next === "idle") setInterim("");
      },
      onError: (code) => {
        if (code !== "aborted") setError(errors[code] || `Speech recognition stopped (${code}). Please try again.`);
      },
    });
    sessionRef.current = session;
    try {
      session.start();
    } catch {
      session.dispose();
      sessionRef.current = null;
      setStatus("idle");
      setError("Could not start speech recognition. Please try again.");
    }
  };

  const stop = () => {
    setStatus("stopping");
    try {
      sessionRef.current?.stop();
    } catch {
      sessionRef.current?.dispose();
      setStatus("idle");
      setInterim("");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([transcript], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meetsync-transcript.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="web-speech">
      <p className="web-speech__status" role="status">
        {status === "listening" ? "● Listening — speak into your microphone" : status === "starting" ? "Waiting for microphone…" : status === "stopping" ? "Finishing transcript…" : "Live speech transcription"}
      </p>
      <label className="web-speech__language">
        Spoken language
        <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={active}>
          <option value="en-IN">English (India)</option>
          <option value="en-US">English (US)</option>
          <option value="hi-IN">Hindi</option>
          <option value="mr-IN">Marathi</option>
        </select>
      </label>
      <div className="web-speech__actions">
        <button type="button" onClick={start} disabled={!supported || active}>Start listening</button>
        <button type="button" onClick={stop} disabled={!active || status === "stopping"}>Stop</button>
        <button type="button" onClick={download} disabled={!transcript || active}>Download transcript</button>
        <button type="button" disabled={active || !transcript} onClick={() => {
          transcriptRef.current = "";
          setTranscript("");
          setInterim("");
          setError("");
        }}>Clear</button>
      </div>
      {!supported && <p role="alert">Live speech recognition is unavailable here. Open MeetSync in Chrome using HTTPS or localhost, or use Audio File Upload.</p>}
      {error && <p role="alert" className="web-speech__error">{error}</p>}
      <div className="web-speech__transcript" aria-label="Live transcript">
        {transcript || (!interim && "Your transcript will appear here as you speak.")}
        {interim && <span className="web-speech__interim"> {interim}</span>}
      </div>
      <p className="web-speech__hint">Captures your microphone. Your browser may send audio to its speech service. Stop before downloading; start again to append more speech.</p>
    </div>
  );
}
