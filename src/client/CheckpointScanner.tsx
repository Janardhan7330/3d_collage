import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export default function CheckpointScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const callback = useRef(onCode);
  callback.current = onCode;
  useEffect(() => {
    let stopped = false,
      controls: IScannerControls | undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This device does not expose a camera. Enter the printed checkpoint code instead.",
      );
      return;
    }
    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current!,
        (result, _error, active) => {
          if (result && !stopped) {
            stopped = true;
            active.stop();
            callback.current(result.getText());
          }
        },
      )
      .then((active) => {
        controls = active;
        if (stopped) active.stop();
      })
      .catch(() =>
        setError(
          "Camera access is unavailable. Allow camera access or enter the printed code.",
        ),
      );
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);
  return (
    <section className="panel">
      <h2>Scan a location checkpoint</h2>
      <p>Point your camera at a checkpoint posted at your current location.</p>
      <video
        className="checkpoint-video"
        ref={video}
        muted
        playsInline
        aria-label="Checkpoint scanner camera"
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary" onClick={onClose}>
        Close scanner
      </button>
    </section>
  );
}
