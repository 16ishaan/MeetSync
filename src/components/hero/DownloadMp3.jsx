import { useState } from "react";
import { encodeMp3 } from "../../lib/exportMp3";

export default function DownloadMp3({ blob, disabled, filename = "meetsync-recording.mp3" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const url = URL.createObjectURL(await encodeMp3(blob));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Could not convert this recording to MP3. Try downloading again in Chrome or Edge.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="audio-recorder__button" type="button" onClick={download} disabled={!blob || disabled || busy}>
        {busy ? "Converting to MP3…" : "Download MP3"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
