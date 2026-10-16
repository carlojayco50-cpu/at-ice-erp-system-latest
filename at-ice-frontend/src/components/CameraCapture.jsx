import { useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/time";

// Take-a-photo only (no upload from the gallery or files), so a delivery photo
// cannot be an old or borrowed picture. Opens the back camera with
// getUserMedia, and "Take Photo" grabs the current frame. The date, time and
// `stamp` text (e.g. the delivery number) are printed on the picture itself.
// onCapture(file, previewUrl) receives a JPEG File; onCapture(null) on Retake
// or ✕ Remove (Remove drops the photo without opening the camera again).
export default function CameraCapture({ stamp = "", onCapture, disabled = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | starting | live | taken | error
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("This browser cannot open the camera. Use Chrome or Safari on your phone.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setState("live");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setState("error");
      // No camera device at all: say so, instead of blaming other apps
      let noCamera = e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError";
      if (!noCamera && e?.name !== "NotAllowedError") {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          noCamera = !devices.some((d) => d.kind === "videoinput");
        } catch { /* keep the generic message */ }
      }
      setError(e?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow the camera for this site, then try again."
        : noCamera
          ? "No camera found. Connect a camera to this device, then try again."
          : "The camera could not be opened. Close other apps using it, then try again.");
    }
  };

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Date, time and the delivery number printed on the photo
    const now = new Date();
    const text = [
      now.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }),
      formatTime(now, { seconds: true }),
      stamp,
    ].filter(Boolean).join("  ·  ");
    const size = Math.max(16, Math.round(canvas.width / 40));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const pad = Math.round(size * 0.6);
    const barH = size + pad * 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pad, canvas.height - barH / 2);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `delivery-${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      stop();
      setPreview(url);
      setState("taken");
      onCapture(file, url);
    }, "image/jpeg", 0.88);
  };

  const remove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setState("idle");
    onCapture(null, null);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onCapture(null, null);
    start();
  };

  if (state === "taken" && preview) {
    return (
      <div className="relative">
        <img src={preview} alt="Delivery photo" className="w-full h-56 object-cover rounded-xl border border-black/[0.08]" />
        <div className="absolute bottom-2 right-2 flex gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            aria-label="Remove the photo"
            className="text-[12px] font-medium text-red-600 bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] cursor-pointer"
          >
            ✕ Remove
          </button>
          <button
            type="button"
            onClick={retake}
            disabled={disabled}
            className="text-[12px] font-medium bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] cursor-pointer"
          >
            Retake
          </button>
        </div>
      </div>
    );
  }

  if (state === "live" || state === "starting") {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative w-full h-56 rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-white/80">Opening the camera…</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { stop(); setState("idle"); }}
            className="flex-1 py-3 bg-white border border-black/[0.08] text-slate-600 text-[13px] font-medium rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={take}
            disabled={state !== "live"}
            className="flex-[2] py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl cursor-pointer disabled:opacity-50"
          >
            Take Photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        className="h-32 w-full rounded-xl border-2 border-dashed border-black/[0.12] flex flex-col items-center justify-center gap-1.5 text-slate-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-[12px]">Tap to open the camera</span>
        <span className="text-[10px] text-slate-400">Take the photo now; uploading a saved picture is not allowed.</span>
      </button>
      {state === "error" && (
        <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
      )}
    </div>
  );
}
