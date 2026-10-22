import { useEffect, useRef, useState } from "react";
import { createSpeechSession } from "../../lib/speechRecognition";
import { extractAssignments, formatSpeakerTranscript } from "../../lib/assignments.js";
import { getSpeakerStatus, transcribeSpeakers } from "../../lib/transcription";
import { startSpeakerRecording } from "../../lib/speakerRecording.js";
import "./WebSpeechIntelligence.css";

const errors = {
  "not-allowed": "Microphone access was denied. Allow microphone access in your browser’s site settings, then try again.",
  "service-not-allowed": "Speech recognition is blocked by your browser. Try Chrome with microphone access enabled.",
  "audio-capture": "No microphone is available. Connect one and try again.",
  network: "The speech service could not connect. Check your internet connection and try again.",
  "no-speech": "No speech detected. Start again and speak near your microphone.",
  "language-not-supported": "This language is unavailable. Choose another language.",
};

export default function WebSpeechIntelligence({ onTranscript }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(Recognition) && window.isSecureContext;
  const [language, setLanguage] = useState("en-IN");
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState('text');
  const [speakerName, setSpeakerName] = useState('');
  const [audio, setAudio] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [segments, setSegments] = useState([]);
  const [names, setNames] = useState({});
  const [processing, setProcessing] = useState(false);
  const [numSpeakers, setNumSpeakers] = useState('-1');
  const [speakerMessage, setSpeakerMessage] = useState('');
  const sessionRef = useRef(null);
  const transcriptRef = useRef("");
  const recorderRef = useRef(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const startingRef = useRef(false);
  const active = status !== "idle";
  const locked = active || processing;
  const labelled = segments.length ? formatSpeakerTranscript(segments, names) : transcript;
  const assignments = extractAssignments(labelled);
  const speakers = [...new Set(segments.map(s => s.speaker))].filter(s => s !== 'Unknown speaker');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.dispose(); recorderRef.current?.cancel(); requestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!audio) { setAudioUrl(''); return; }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const finishRecording = async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    const blob = await recorder.stop();
    if (mountedRef.current) {
      setAudio(blob?.size ? blob : null);
      setStatus('idle');
    }
  };

  const start = async () => {
    if (!supported || locked || startingRef.current) return;
    startingRef.current = true;
    sessionRef.current?.dispose();
    const previous = transcriptRef.current;
    setError("");
    setInterim("");
    setStatus("starting");
    setSpeakerMessage('');
    try {
      if (mode === 'speakers') {
        const availability = await getSpeakerStatus();
        if (!mountedRef.current) { startingRef.current = false; return; }
        if (!availability.available) throw new Error(availability.message);
        const recorder = await startSpeakerRecording({ onLimit: message => {
          if (!mountedRef.current) return;
          setError(message);
          try { sessionRef.current?.stop(); } catch { /* recorder stops itself at the limit */ }
          finishRecording();
        } });
        if (!mountedRef.current) { recorder.cancel(); return; }
        recorderRef.current = recorder;
      }
    } catch (err) {
      if (mountedRef.current) { setStatus('idle'); setError(err.name === 'NotAllowedError' ? errors['not-allowed'] : err.message || 'Could not start audio recording.'); }
      startingRef.current = false;
      return;
    }
    if (!mountedRef.current) { startingRef.current = false; return; }
    const label = speakerName.trim().replace(/[:\r\n]/g, '');
    const session = createSpeechSession({
      Recognition,
      language,
      onText: (final, pending) => {
        const turn = final ? `${label && mode === 'text' ? label + ': ' : ''}${final}` : '';
        const text = [previous, turn].filter(Boolean).join("\n");
        transcriptRef.current = text;
        setTranscript(text);
        setInterim(pending);
      },
      onState: (next) => {
        if (next === 'idle' && recorderRef.current) {
          setStatus('stopping');
          finishRecording();
          setInterim('');
          return;
        }
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
      recorderRef.current?.cancel(); recorderRef.current = null;
    }
    startingRef.current = false;
  };

  const stop = () => {
    setStatus("stopping");
    try {
      sessionRef.current?.stop();
    } catch {
      sessionRef.current?.dispose();
      finishRecording();
      setStatus("idle");
      setInterim("");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([labelled], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meetsync-transcript.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const detect = async () => {
    if (!audio || locked) return;
    setProcessing(true); setError(''); setSpeakerMessage('Separating voices locally. Longer recordings take more time…');
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 600000);
    try {
      const result = await transcribeSpeakers(audio, controller.signal, Number(numSpeakers));
      if (!mountedRef.current) return;
      setSegments(result.segments); setNames({});
      setSpeakerMessage(result.segments.length ? 'Voices separated. Play the recording and give each speaker a name below.' : 'No speech detected. Your live text is still available.');
    } catch (err) {
      if (mountedRef.current) { setError(err.name === 'AbortError' ? 'Speaker detection stopped or timed out. Your live text and recording are kept; you can retry.' : err.message); setSpeakerMessage(''); }
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current) setProcessing(false);
      requestRef.current = null;
    }
  };

  return (
    <div className="web-speech">
      <p className="web-speech__status" role="status">
        {status === "listening" ? "● Listening — speak into your microphone" : status === "starting" ? "Waiting for microphone…" : status === "stopping" ? "Finishing transcript…" : "Live speech transcription"}
      </p>
      <label className="web-speech__language">
        Spoken language
        <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={locked}>
          <option value="en-IN">English (India)</option>
          <option value="en-US">English (US)</option>
          <option value="hi-IN">Hindi</option>
          <option value="mr-IN">Marathi</option>
        </select>
      </label>
      <label className="web-speech__language">Transcript mode
        <select value={mode} onChange={e => setMode(e.target.value)} disabled={locked || Boolean(transcript || audio)}>
          <option value="text">Live text with optional speaker name</option>
          <option value="speakers">Live text + detect voices after Stop</option>
        </select>
      </label>
      {mode === 'text' ? <label className="web-speech__language">Who is speaking? (optional)
        <input maxLength={80} value={speakerName} disabled={locked} placeholder="e.g. Ishaan" onChange={e => setSpeakerName(e.target.value)} />
        <span className="web-speech__hint">This is a manual label. Stop, change the name, then start for the next person.</span>
      </label> : <p className="web-speech__hint">Records microphone audio for local voice separation after Stop. Then name Speaker 1, Speaker 2… Names cannot be inferred from people mentioned. Up to 15 minutes / 30 MB. Clear to begin another recording.</p>}
      <div className="web-speech__actions">
        <button type="button" onClick={start} disabled={!supported || locked || (mode === 'speakers' && Boolean(transcript || audio)) || (mode === 'speakers' && !window.MediaRecorder)}>Start listening</button>
        <button type="button" onClick={stop} disabled={!active || status === "stopping" || status === 'starting'}>Stop</button>
        <button type="button" onClick={download} disabled={!labelled || locked}>Download transcript</button>
        <button type="button" disabled={locked || !(transcript || audio)} onClick={() => {
          transcriptRef.current = "";
          setTranscript("");
          setInterim("");
          setError("");
          setAudio(null); setSegments([]); setNames({}); setSpeakerMessage('');
        }}>Clear</button>
      </div>
      {mode === 'speakers' && !window.MediaRecorder && <p role="alert">Audio recording is unavailable in this browser. Choose live text mode.</p>}
      {audioUrl && <div className="web-speech__speaker-panel">
        <audio controls src={audioUrl} aria-label="Speaker recording playback" />
        <label className="web-speech__language">Number of speakers (optional)
          <select value={numSpeakers} disabled={locked} onChange={e => setNumSpeakers(e.target.value)}><option value="-1">Auto-detect</option>{Array.from({length:20}, (_,i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
          <span className="web-speech__hint">A known count can help if one voice is split into several speakers.</span>
        </label>
        <button type="button" disabled={locked} onClick={detect}>{segments.length ? 'Detect speakers again' : 'Detect speakers'}</button>
        {processing && <button type="button" onClick={() => requestRef.current?.abort()}>Cancel detection</button>}
      </div>}
      {speakerMessage && <p className="web-speech__hint" role="status">{speakerMessage}</p>}
      {speakers.length > 0 && <fieldset className="web-speech__speaker-panel"><legend>Name the speakers</legend>
        {speakers.map(speaker => <label className="web-speech__language" key={speaker}>{speaker}<input maxLength={80} disabled={locked} placeholder="Enter name" value={names[speaker] || ''} onChange={e => setNames(current => ({ ...current, [speaker]: e.target.value.replace(/[:\r\n]/g, '') }))} /></label>)}
      </fieldset>}
      {!supported && <p role="alert">Live speech recognition is unavailable here. Open MeetSync in Chrome using HTTPS or localhost, or use Audio File Upload.</p>}
      {error && <p role="alert" className="web-speech__error">{error}</p>}
      <div className="web-speech__transcript" aria-label="Live transcript">
        {labelled || (!interim && "Your transcript will appear here as you speak.")}
        {interim && <span className="web-speech__interim"> {interim}</span>}
      </div>
      {segments.length > 0 && <p className="web-speech__hint">Speaker labels are model estimates. Overlapping or unmatched words may appear as Unknown speaker. Review against the recording before sharing.</p>}
      {assignments.length > 0 && <section className="web-speech__speaker-panel" aria-label="Who does what"><h4>Who does what</h4>
        {assignments.map((action, i) => <p key={i}><strong>{action.owner}:</strong> {action.task}</p>)}
        <p className="web-speech__hint">English assignment draft, separate from speaker labels. Review and edit in the MOM workspace.</p>
      </section>}
      {labelled && !locked && <button type="button" className="mom-capture-send" onClick={() => onTranscript?.(labelled)}>Use transcript for MOM →</button>}
      <p className="web-speech__hint">Captures your microphone. Your browser may send audio to its speech service. Stop before downloading; start again to append more speech.</p>
    </div>
  );
}
