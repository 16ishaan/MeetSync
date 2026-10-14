import { useEffect, useRef, useState } from "react";
import { deleteRecording, saveRecording } from "../../lib/recordings";
import { transcribeAudio } from "../../lib/transcription";
import {
  deleteLocalRecording,
  getLatestLocalRecording,
  saveLocalRecording,
} from "../../lib/localRecordings";

const getSupportedMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const formatDuration = (durationMs) => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export default function AudioRecorder({ user }) {
  const [status, setStatus] = useState("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [message, setMessage] = useState("Ready when you are.");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [playbackError, setPlaybackError] = useState(false);
  const [localRecordingId, setLocalRecordingId] = useState(null);
  const [cloudRecording, setCloudRecording] = useState(null);
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef(null);
  const mediaStreamsRef = useRef([]);
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const playbackUrlRef = useRef("");
  const latestBlobRef = useRef(null);

  const isRecording = status === "recording";
  const isBusy = [
    "requesting",
    "stopping",
    "uploading",
    "deleting",
    "transcribing",
  ].includes(status);

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
      setMessage(
        "This browser does not support microphone and browser audio recording.",
      );
      return;
    }

    setStatus("requesting");
    setMessage("Choose a browser tab and enable Share tab audio.");

    try {
      const browserStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (browserStream.getAudioTracks().length === 0) {
        browserStream.getTracks().forEach((track) => track.stop());
        throw new Error(
          "Browser audio was not shared. Choose a tab and enable Share tab audio.",
        );
      }

      setMessage(
        "Browser audio selected. Waiting for microphone permission...",
      );
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const audioContext = new AudioContext();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(browserStream).connect(destination);
      audioContext
        .createMediaStreamSource(microphoneStream)
        .connect(destination);

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined,
      );

      mediaStreamsRef.current = [
        browserStream,
        microphoneStream,
        destination.stream,
      ];
      audioContextRef.current = audioContext;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
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

      browserStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "recording") return;
        setStatus("stopping");
        setMessage("Browser sharing ended. Finishing the recording...");
        recorder.stop();
      });

      recorder.onstop = async () => {
        window.clearInterval(timerRef.current);
        stopTracks();
        const recordingDurationMs = Date.now() - startedAtRef.current;
        setDurationMs(0);
        setStatus("uploading");
        setMessage(
          "Recording complete. Saving microphone and browser audio...",
        );

        try {
          const blob = new Blob(chunksRef.current, {
            type:
              recorder.mimeType || chunksRef.current[0]?.type || "audio/webm",
          });
          if (blob.size === 0) throw new Error("No audio data was captured.");

          replacePlaybackUrl(URL.createObjectURL(blob));
          latestBlobRef.current = blob;
          setPlaybackError(false);
          setStatus("saved-local");

          try {
            const savedLocalId = await saveLocalRecording({
              blob,
              durationMs: recordingDurationMs,
            });
            setLocalRecordingId(savedLocalId);
          } catch {
            setMessage("Recording ready for playback in this session.");
          }

          if (user?.id) {
            try {
              const saved = await saveRecording({
                blob,
                durationMs: recordingDurationMs,
                userId: user.id,
              });
              setCloudRecording(saved);
              setStatus("saved");
              setMessage(
                `Saved microphone and browser audio to MeetSync at ${new Date(saved.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
              );
            } catch (error) {
              setStatus("saved-local");
              setMessage(
                `Saved on this device. Cloud save unavailable: ${error.message}`,
              );
            }
          } else {
            setMessage(
              "Saved on this device. Sign in later to save it to MeetSync.",
            );
          }
        } catch (error) {
          setStatus("error");
          setMessage(error.message || "The recording could not be saved.");
        }
      };

      recorder.start(1000);
      setStatus(recorder.state === "recording" ? "recording" : "error");
      setMessage("Microphone and browser audio are being captured.");
      if (recorder.state === "recording") {
        timerRef.current = window.setInterval(() => {
          setDurationMs(Date.now() - startedAtRef.current);
        }, 250);
      }
    } catch (error) {
      stopTracks();
      setStatus("error");
      setMessage(
        error.name === "NotAllowedError"
          ? "Recording permission was denied."
          : error.message || "Unable to start audio capture.",
      );
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state !== "recording")
      return;
    setStatus("stopping");
    setMessage("Finishing the microphone and browser audio file...");
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
      setStatus("idle");
      setMessage("Recording deleted. Ready when you are.");
    } catch (error) {
      setStatus("saved-local");
      setMessage(`Could not delete recording: ${error.message}`);
    }
  };

  const transcribeCurrentRecording = async () => {
    if (!latestBlobRef.current) return;
    setStatus("transcribing");
    setMessage("Transcribing with Whisper...");
    try {
      const result = await transcribeAudio(latestBlobRef.current);
      setTranscript(result.text || "No speech was detected.");
      setStatus(cloudRecording ? "saved" : "saved-local");
      setMessage(
        `Transcription complete. Detected language: ${result.language}.`,
      );
    } catch (error) {
      setStatus(cloudRecording ? "saved" : "saved-local");
      setMessage(`Transcription unavailable: ${error.message}`);
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
              : status === "uploading"
                ? "Saving recording"
                : status === "deleting"
                  ? "Deleting recording"
                  : status === "transcribing"
                    ? "Transcribing recording"
                    : status === "saved"
                      ? "Recording saved"
                      : status === "saved-local"
                        ? "Saved on this device"
                        : "Not recording"}
        </span>
      </div>
      <div className="audio-recorder__readout">
        <strong>{formatDuration(durationMs)}</strong>
        <span>{message}</span>
      </div>
      <div className="audio-recorder__actions">
        <button
          type="button"
          className="audio-recorder__button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
          aria-pressed={isRecording}
        >
          <span className="audio-recorder__button-icon" aria-hidden="true">
            {isRecording ? "■" : "●"}
          </span>
          {isRecording ? "Stop recording" : "Start recording"}
        </button>
        {playbackUrl && (
          <audio
            className="audio-recorder__audio"
            controls
            preload="metadata"
            src={playbackUrl}
            onError={() => {
              setPlaybackError(true);
              setMessage(
                "This browser could not decode the recorded audio. Try Chrome or Edge.",
              );
            }}
          />
        )}
        {playbackUrl && (
          <button
            type="button"
            className="audio-recorder__button"
            onClick={transcribeCurrentRecording}
            disabled={isBusy}
          >
            Transcribe
          </button>
        )}
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
            Playback is unavailable for this recording in the current browser.
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
