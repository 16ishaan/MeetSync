import { useCallback, useEffect, useRef, useState } from "react";
import { createMeeting, updateMeeting, MEETING_STATUS } from "../../lib/meetingStore";

export default function WebSpeechCapture({ user, onMeetingReady }) {
  const [isSupported, setIsSupported] = useState(() => {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [currentMeetingId, setCurrentMeetingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(
    () =>
      window.SpeechRecognition || window.webkitSpeechRecognition
        ? "Live in-browser speech recognition."
        : "Web Speech API not supported in this browser."
  );

  // Stable refs so callbacks never go stale
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const fullTranscriptRef = useRef("");
  const isListeningRef = useRef(false);
  const isPausedRef = useRef(false);
  const meetingIdRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { meetingIdRef.current = currentMeetingId; }, [currentMeetingId]);

  // Create recognition object ONCE on mount
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
          finalChunk += item[0].transcript + " ";
        } else {
          interim += item[0].transcript;
        }
      }

      if (finalChunk) {
        fullTranscriptRef.current = (
          fullTranscriptRef.current + " " + finalChunk
        ).trim();
        setTranscript(fullTranscriptRef.current);
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setStatusMessage("Microphone access was denied.");
        // Stop listening state without triggering full stopListening async flow
        window.clearInterval(timerRef.current);
        setIsListening(false);
        setIsPaused(false);
        setInterimText("");
        isListeningRef.current = false;
        isPausedRef.current = false;
      } else if (event.error !== "no-speech") {
        setStatusMessage(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening (continuous mode broken by browser)
      if (isListeningRef.current && !isPausedRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          isListeningRef.current = false;
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      window.clearInterval(timerRef.current);
      try {
        recognition.abort();
      } catch {}
    };
  }, []); // Empty deps — create recognition once only

  const startListening = useCallback(async () => {
    if (!recognitionRef.current || isListeningRef.current) return;
    try {
      fullTranscriptRef.current = "";
      setTranscript("");
      setInterimText("");
      setDurationMs(0);
      accumulatedMsRef.current = 0;
      startTimeRef.current = Date.now();

      // Create meeting record
      try {
        const newMeeting = await createMeeting({
          title: `Live Meeting – ${new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date())}`,
        });
        setCurrentMeetingId(newMeeting.id);
        meetingIdRef.current = newMeeting.id;
        await updateMeeting(newMeeting.id, {
          status: MEETING_STATUS.RECORDING,
          started_at: Date.now(),
        });
      } catch {
        /* fallback */
      }

      recognitionRef.current.start();
      isListeningRef.current = true;
      setIsListening(true);
      isPausedRef.current = false;
      setIsPaused(false);
      setStatusMessage("Listening… speak clearly into your mic.");

      timerRef.current = window.setInterval(() => {
        setDurationMs(
          accumulatedMsRef.current + (Date.now() - startTimeRef.current)
        );
      }, 250);
    } catch (err) {
      setStatusMessage(`Could not start recognition: ${err.message}`);
    }
  }, []);

  const pauseListening = useCallback(() => {
    if (!recognitionRef.current || !isListeningRef.current) return;
    try {
      recognitionRef.current.stop();
      window.clearInterval(timerRef.current);
      accumulatedMsRef.current += Date.now() - startTimeRef.current;
      isPausedRef.current = true;
      setIsPaused(true);
      setStatusMessage("Paused speech recognition.");
      const mid = meetingIdRef.current;
      if (mid) {
        updateMeeting(mid, { status: MEETING_STATUS.PAUSED }).catch(() => {});
      }
    } catch {}
  }, []);

  const resumeListening = useCallback(() => {
    if (!recognitionRef.current || !isListeningRef.current) return;
    try {
      startTimeRef.current = Date.now();
      recognitionRef.current.start();
      isPausedRef.current = false;
      setIsPaused(false);
      setStatusMessage("Listening… speak clearly into your mic.");
      timerRef.current = window.setInterval(() => {
        setDurationMs(
          accumulatedMsRef.current + (Date.now() - startTimeRef.current)
        );
      }, 250);
      const mid = meetingIdRef.current;
      if (mid) {
        updateMeeting(mid, { status: MEETING_STATUS.RECORDING }).catch(() => {});
      }
    } catch {}
  }, []);

  const stopListening = useCallback(async () => {
    window.clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    isListeningRef.current = false;
    isPausedRef.current = false;
    setIsListening(false);
    setIsPaused(false);
    setInterimText("");

    const finalText = fullTranscriptRef.current.trim();
    const finalDuration =
      accumulatedMsRef.current +
      (startTimeRef.current ? Date.now() - startTimeRef.current : 0);

    if (finalText) {
      setStatusMessage("Transcript captured. Ready to review.");
      let meetingId = meetingIdRef.current;
      if (!meetingId) {
        try {
          const m = await createMeeting({
            title: `Live Meeting – ${new Intl.DateTimeFormat("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date())}`,
          });
          meetingId = m.id;
          setCurrentMeetingId(meetingId);
          meetingIdRef.current = meetingId;
        } catch {}
      }

      if (meetingId) {
        await updateMeeting(meetingId, {
          transcript: finalText,
          duration_ms: finalDuration,
          status: MEETING_STATUS.TRANSCRIBED,
          transcription_status: "web-speech",
        });

        if (onMeetingReady) {
          onMeetingReady({
            meetingId,
            transcript: finalText,
            durationMs: finalDuration,
          });
        }
      }
    } else {
      setStatusMessage("No speech was detected.");
    }
  }, [onMeetingReady]);

  const handleOpenMeeting = useCallback(() => {
    const mid = meetingIdRef.current;
    if (mid && onMeetingReady) {
      onMeetingReady({
        meetingId: mid,
        transcript: transcript || fullTranscriptRef.current,
        durationMs,
      });
    }
  }, [onMeetingReady, transcript, durationMs]);

  const formatTimer = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60)
      .toString()
      .padStart(2, "0");
    const s = (totalSecs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      className={`web-speech-capture ${
        isListening ? "web-speech-capture--active" : ""
      }`}
    >
      <div className="web-speech__signal">
        <span
          className={`web-speech__signal-dot ${
            isListening && !isPaused
              ? "web-speech__signal-dot--live"
              : transcript
              ? "web-speech__signal-dot--ready"
              : ""
          }`}
          aria-hidden="true"
        />
        <span>
          {!isSupported
            ? "Unavailable"
            : isListening && !isPaused
            ? `Live · ${formatTimer(durationMs)}`
            : isPaused
            ? `Paused · ${formatTimer(durationMs)}`
            : transcript
            ? "Transcript Ready"
            : "Ready"}
        </span>
      </div>

      <p className="web-speech__status">{statusMessage}</p>

      {/* Live transcript snippet */}
      {(transcript || interimText) && (
        <div className="web-speech__preview" title="Live transcribed text">
          <span>{transcript}</span>
          {interimText && (
            <span className="web-speech__interim"> {interimText}</span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="web-speech__actions">
        {!isSupported ? (
          <span className="web-speech__unsupported">
            Use Chrome or Edge for Live Speech
          </span>
        ) : !isListening ? (
          <>
            <button
              type="button"
              className="web-speech__btn web-speech__btn--primary"
              onClick={startListening}
            >
              Start Live Speech
            </button>
            {transcript && meetingIdRef.current && (
              <button
                type="button"
                className="web-speech__btn web-speech__btn--secondary"
                onClick={handleOpenMeeting}
              >
                Go to MoM →
              </button>
            )}
          </>
        ) : (
          <>
            {!isPaused ? (
              <button
                type="button"
                className="web-speech__btn"
                onClick={pauseListening}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                className="web-speech__btn"
                onClick={resumeListening}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              className="web-speech__btn web-speech__btn--stop"
              onClick={stopListening}
            >
              Stop & Review
            </button>
          </>
        )}
      </div>
    </div>
  );
}
