import { useEffect, useRef, useState } from "react";
import { deleteRecording, saveRecording } from "../../lib/recordings";
import { transcribeAudio } from "../../lib/transcription";
import {
  deleteLocalRecording,
  getLatestLocalRecording,
  saveLocalRecording,
} from "../../lib/localRecordings";
import {
  createMeeting,
  updateMeeting,
  MEETING_STATUS,
} from "../../lib/meetingStore";

const getSupportedMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const formatDuration = (durationMs) => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export default function AudioRecorder({ user, onMeetingReady }) {
  const [status, setStatus] = useState("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [message, setMessage] = useState("Ready when you are.");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [playbackError, setPlaybackError] = useState(false);
  const [localRecordingId, setLocalRecordingId] = useState(null);
  const [cloudRecording, setCloudRecording] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [currentMeetingId, setCurrentMeetingId] = useState(null);

  const recorderRef = useRef(null);
  const mediaStreamsRef = useRef([]);
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);
  // Accumulated recorded time (excludes paused time)
  const recordedMsRef = useRef(0);
  // Timestamp when current recording segment started
  const segmentStartRef = useRef(0);
  const timerRef = useRef(null);
  const playbackUrlRef = useRef("");
  const latestBlobRef = useRef(null);

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isBusy = [
    "requesting", "stopping", "uploading", "deleting", "transcribing",
  ].includes(status);
  const canTranscribe = ["saved", "saved-local"].includes(status) && !!latestBlobRef.current;

  const replacePlaybackUrl = (nextUrl) => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = nextUrl;
    setPlaybackUrl(nextUrl);
  };

  const stopTracks = () => {
    mediaStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    mediaStreamsRef.current = [];
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Load latest local recording on mount
  useEffect(() => {
    let active = true;
    getLatestLocalRecording()
      .then((recording) => {
        if (!active || !recording?.blob) return;
        setLocalRecordingId(recording.id);
        latestBlobRef.current = recording.blob;
        replacePlaybackUrl(URL.createObjectURL(recording.blob));
        setStatus("saved-local");
        setMessage("Latest recording is ready on this device.");
      })
      .catch(() => {});

    return () => {
      active = false;
      window.clearInterval(timerRef.current);
      stopTracks();
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !navigator.mediaDevices?.getDisplayMedia ||
      !window.MediaRecorder
    ) {
      setStatus("error");
      setMessage("This browser does not support microphone and browser audio recording.");
      return;
    }

    setStatus("requesting");
    setMessage("Choose a browser tab and enable 'Share tab audio'.");

    try {
      // 1. Request browser tab audio (screen share with audio)
      const browserStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (browserStream.getAudioTracks().length === 0) {
        browserStream.getTracks().forEach((t) => t.stop());
        throw new Error(
          "Browser audio was not shared. Choose a tab and enable 'Share tab audio'."
        );
      }

      setMessage("Browser audio selected. Waiting for microphone permission...");

      // 2. Request microphone
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Mix streams
      const audioContext = new AudioContext();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(browserStream).connect(destination);
      audioContext.createMediaStreamSource(microphoneStream).connect(destination);

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined
      );

      mediaStreamsRef.current = [browserStream, microphoneStream, destination.stream];
      audioContextRef.current = audioContext;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordedMsRef.current = 0;
      segmentStartRef.current = Date.now();
      setDurationMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        window.clearInterval(timerRef.current);
        stopTracks();
        setStatus("error");
        setMessage("The browser stopped the recording unexpectedly.");
      };

      // Handle user stopping screen share externally
      browserStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
          setStatus("stopping");
          setMessage("Browser sharing ended. Finishing the recording...");
          recorderRef.current.stop();
        }
      });

      recorder.onstop = async () => {
        window.clearInterval(timerRef.current);
        // Accumulate final segment
        if (segmentStartRef.current > 0) {
          recordedMsRef.current += Date.now() - segmentStartRef.current;
          segmentStartRef.current = 0;
        }
        const finalDurationMs = recordedMsRef.current;
        stopTracks();
        setDurationMs(0);
        setStatus("uploading");
        setMessage("Recording complete. Saving audio...");

        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || chunksRef.current[0]?.type || "audio/webm",
          });
          if (blob.size === 0) throw new Error("No audio data was captured.");

          replacePlaybackUrl(URL.createObjectURL(blob));
          latestBlobRef.current = blob;
          setPlaybackError(false);
          setStatus("saved-local");

          // Save locally
          let savedLocalId = null;
          try {
            savedLocalId = await saveLocalRecording({ blob, durationMs: finalDurationMs });
            setLocalRecordingId(savedLocalId);
          } catch {
            setMessage("Recording ready for playback in this session.");
          }

          // Create or update meeting record in IndexedDB
          let meetingId = currentMeetingId;
          try {
            if (!meetingId) {
              const newMeeting = await createMeeting({
                title: `Meeting – ${new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                }).format(new Date())}`,
                localRecordingId: savedLocalId,
              });
              meetingId = newMeeting.id;
              setCurrentMeetingId(meetingId);
            }
            await updateMeeting(meetingId, {
              status: MEETING_STATUS.RECORDED,
              ended_at: Date.now(),
              duration_ms: finalDurationMs,
              local_recording_id: savedLocalId,
            });
          } catch { /* non-fatal */ }

          // Try cloud save
          if (user?.id) {
            try {
              const saved = await saveRecording({ blob, durationMs: finalDurationMs, userId: user.id });
              setCloudRecording(saved);
              setStatus("saved");

              if (meetingId) {
                await updateMeeting(meetingId, {
                  cloud_recording_id: saved.id,
                  cloud_recording_path: saved.storage_path,
                });
              }

              setMessage(
                `Saved microphone and browser audio to MeetSync at ${new Date(saved.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              );
            } catch (err) {
              setStatus("saved-local");
              setMessage(`Saved on this device. Cloud save unavailable: ${err.message}`);
            }
          } else {
            setMessage("Saved on this device. Sign in to sync to MeetSync cloud.");
          }

          // Meeting record is created/updated; user presses "Transcribe" or "Open meeting →" next.
          // Do NOT call onMeetingReady here — transcript is not available yet.

        } catch (err) {
          setStatus("error");
          setMessage(err.message || "The recording could not be saved.");
        }
      };

      recorder.start(1000);
      if (recorder.state === "recording") {
        setStatus("recording");
        setMessage("Microphone and browser audio are being captured.");
        timerRef.current = window.setInterval(() => {
          const elapsed = recordedMsRef.current + (Date.now() - segmentStartRef.current);
          setDurationMs(elapsed);
        }, 250);
      } else {
        setStatus("error");
        setMessage("Failed to start recording.");
      }

      // Create meeting record immediately on start
      try {
        const newMeeting = await createMeeting({
          title: `Meeting – ${new Intl.DateTimeFormat("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          }).format(new Date())}`,
        });
        setCurrentMeetingId(newMeeting.id);
        await updateMeeting(newMeeting.id, {
          status: MEETING_STATUS.RECORDING,
          started_at: Date.now(),
        });
      } catch { /* non-fatal */ }

    } catch (err) {
      stopTracks();
      setStatus("error");
      setMessage(
        err.name === "NotAllowedError"
          ? "Recording permission was denied."
          : err.message || "Unable to start audio capture."
      );
    }
  };

  const pauseRecording = () => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") return;
    recorderRef.current.pause();
    window.clearInterval(timerRef.current);
    // Accumulate time for this segment
    recordedMsRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = 0;
    setStatus("paused");
    setMessage("Recording paused. Press Resume to continue.");
    if (currentMeetingId) {
      updateMeeting(currentMeetingId, { status: MEETING_STATUS.PAUSED }).catch(() => {});
    }
  };

  const resumeRecording = () => {
    if (!recorderRef.current || recorderRef.current.state !== "paused") return;
    recorderRef.current.resume();
    segmentStartRef.current = Date.now();
    setStatus("recording");
    setMessage("Microphone and browser audio are being captured.");
    timerRef.current = window.setInterval(() => {
      const elapsed = recordedMsRef.current + (Date.now() - segmentStartRef.current);
      setDurationMs(elapsed);
    }, 250);
    if (currentMeetingId) {
      updateMeeting(currentMeetingId, { status: MEETING_STATUS.RECORDING }).catch(() => {});
    }
  };

  const stopRecording = () => {
    if (
      !recorderRef.current ||
      !["recording", "paused"].includes(recorderRef.current.state)
    ) return;
    setStatus("stopping");
    setMessage("Finishing the audio file...");
    recorderRef.current.stop();
  };

  const deleteCurrentRecording = async () => {
    setStatus("deleting");
    setMessage("Deleting recording...");
    try {
      await deleteLocalRecording(localRecordingId);
      if (cloudRecording && user?.id) {
        await deleteRecording({
          recordingId: cloudRecording.id,
          storagePath: cloudRecording.storage_path,
          userId: user.id,
        });
      }
      replacePlaybackUrl("");
      setLocalRecordingId(null);
      setCloudRecording(null);
      setPlaybackError(false);
      setDurationMs(0);
      setTranscript("");
      setCurrentMeetingId(null);
      setStatus("idle");
      setMessage("Recording deleted. Ready when you are.");
    } catch (err) {
      setStatus("saved-local");
      setMessage(`Could not delete recording: ${err.message}`);
    }
  };

  const transcribeCurrentRecording = async () => {
    if (!latestBlobRef.current) return;
    setStatus("transcribing");
    setMessage("Transcribing with Whisper...");
    try {
      const result = await transcribeAudio(latestBlobRef.current);
      const text = result.text || "No speech was detected.";
      setTranscript(text);
      setStatus(cloudRecording ? "saved" : "saved-local");
      setMessage(`Transcription complete. Detected language: ${result.language}.`);

      let meetingId = currentMeetingId;
      if (!meetingId) {
        try {
          const newMeeting = await createMeeting({
            title: `Recording – ${new Intl.DateTimeFormat("en-GB", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            }).format(new Date())}`,
            localRecordingId: localRecordingId,
          });
          meetingId = newMeeting.id;
          setCurrentMeetingId(meetingId);
        } catch { /* fallback */ }
      }

      if (meetingId) {
        await updateMeeting(meetingId, {
          transcript: text,
          transcription_status: "completed",
          status: MEETING_STATUS.TRANSCRIBED,
        });
        if (onMeetingReady) {
          onMeetingReady({
            meetingId,
            blob: latestBlobRef.current,
            transcript: text,
          });
        }
      }
    } catch (err) {
      setStatus(cloudRecording ? "saved" : "saved-local");
      setMessage(`Transcription unavailable: ${err.message}`);
      if (currentMeetingId) {
        await updateMeeting(currentMeetingId, {
          transcription_status: "error",
        });
      }
    }
  };

  return (
    <div className={`audio-recorder audio-recorder--${status}`}>
      <div className="audio-recorder__signal" aria-live="polite">
        <span className="audio-recorder__signal-dot" aria-hidden="true" />
        <span>
          {status === "requesting"
            ? "Permission needed"
            : isRecording
              ? "Recording now"
              : isPaused
                ? "Paused"
                : status === "stopping"
                  ? "Finishing…"
                  : status === "uploading"
                    ? "Saving recording"
                    : status === "deleting"
                      ? "Deleting recording"
                      : status === "transcribing"
                        ? "Transcribing"
                        : status === "saved"
                          ? "Recording saved"
                          : status === "saved-local"
                            ? "Saved on device"
                            : "Not recording"}
        </span>
      </div>

      <div className="audio-recorder__readout">
        <strong>{formatDuration(isRecording || isPaused ? durationMs : 0)}</strong>
        <span>{message}</span>
      </div>

      <div className="audio-recorder__actions">
        {/* Start button */}
        {status === "idle" || status === "error" ? (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={startRecording}
            disabled={isBusy}
          >
            <span className="audio-recorder__button-icon" aria-hidden="true">●</span>
            Start recording
          </button>
        ) : null}

        {/* Pause / Resume */}
        {isRecording && (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={pauseRecording}
          >
            <span className="audio-recorder__button-icon" aria-hidden="true">⏸</span>
            Pause
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={resumeRecording}
          >
            <span className="audio-recorder__button-icon" aria-hidden="true">▶</span>
            Resume
          </button>
        )}

        {/* Stop */}
        {(isRecording || isPaused) && (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={stopRecording}
          >
            <span className="audio-recorder__button-icon" aria-hidden="true">■</span>
            Stop recording
          </button>
        )}

        {/* Playback */}
        {playbackUrl && (
          <audio
            className="audio-recorder__audio"
            controls
            preload="metadata"
            src={playbackUrl}
            onError={() => {
              setPlaybackError(true);
              setMessage("This browser could not decode the recorded audio. Try Chrome or Edge.");
            }}
          />
        )}

        {/* Transcribe */}
        {canTranscribe && !transcript && (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={transcribeCurrentRecording}
            disabled={isBusy}
          >
            Transcribe
          </button>
        )}

        {/* Open in meeting view — only after transcript is ready */}
        {currentMeetingId && onMeetingReady && transcript && (
          <button
            type="button"
            className="audio-recorder__button"
            style={{ borderColor: "rgba(110, 91, 255, 0.6)", color: "#a79bff" }}
            onClick={() => onMeetingReady({ meetingId: currentMeetingId, blob: latestBlobRef.current, transcript })}
            disabled={isBusy}
          >
            Open meeting →
          </button>
        )}


        {/* Delete */}
        {playbackUrl && (
          <button
            type="button"
            className="audio-recorder__delete-button"
            onClick={deleteCurrentRecording}
            disabled={isBusy}
          >
            Delete
          </button>
        )}

        {playbackError && (
          <span className="audio-recorder__error" role="alert">
            Playback is unavailable in this browser. Try Chrome or Edge.
          </span>
        )}
      </div>

      {transcript && (
        <div className="audio-recorder__transcript" aria-live="polite">
          <strong>Transcript</strong>
          <p>{transcript}</p>
        </div>
      )}
    </div>
  );
}
