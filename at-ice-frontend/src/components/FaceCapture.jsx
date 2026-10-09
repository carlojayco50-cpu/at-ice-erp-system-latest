import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const CameraIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const CheckIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;

// The face-api.js models are loaded once per page load and shared.
let modelsPromise = null;
function loadModels() {
  if (!modelsPromise) {
    const MODEL_URL = "/models";
    modelsPromise = Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).catch((err) => {
      modelsPromise = null; // let the next try load again
      throw err;
    });
  }
  return modelsPromise;
}

// Webcam Capture card: live camera, Capture Face / Retake, and a box on the
// detected face. The parent keeps the 128-point descriptor: onChange gets
// (descriptor, photo), photo being a JPEG data URL of the face, or (null, null)
// on Retake. onError gets a message to show when something fails.
// Used by the Face action in HRIS > Employees.
export default function FaceCapture({ descriptor, onChange, onError, title = "Webcam Capture" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [faceBox, setFaceBox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then(() => !cancelled && setModelsLoaded(true))
      .catch((err) => {
        console.error("Model load error:", err);
        if (!cancelled) onError?.("Failed to load face recognition models. Check public/models/.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modelsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      } catch (err) {
        console.error("Camera error:", err);
        onError?.("Could not access webcam. Check browser permissions.");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoaded]);

  // The parent cleared the capture (Retake, or after saving): drop the box too.
  const shownBox = descriptor ? faceBox : null;

  // The video uses object-cover, so the picture on screen is scaled and
  // cropped. The detection box is converted from video pixels to screen
  // pixels so it lands on the face.
  const toScreenBox = (box) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const cw = v.clientWidth, ch = v.clientHeight;
    const scale = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const offX = (cw - v.videoWidth * scale) / 2;
    const offY = (ch - v.videoHeight * scale) / 2;
    return { left: box.x * scale + offX, top: box.y * scale + offY, width: box.width * scale, height: box.height * scale };
  };

  // Picture of the face saved with the enrollment: a square around the face
  // with some margin, at most 480px, as a JPEG data URL.
  const snapshot = (box) => {
    const v = videoRef.current;
    const side = Math.min(Math.max(box.width, box.height) * 1.8, v.videoWidth, v.videoHeight);
    const sx = Math.min(Math.max(box.x + box.width / 2 - side / 2, 0), v.videoWidth - side);
    const sy = Math.min(Math.max(box.y + box.height / 2 - side / 2, 0), v.videoHeight - side);
    const out = Math.min(480, Math.round(side));
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    canvas.getContext("2d").drawImage(v, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setDetecting(true);
    try {
      const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
      if (!detection) {
        onChange(null, null);
        onError?.("No face detected. Center the worker's face, face the camera, and try again.");
        return;
      }
      setFaceBox(toScreenBox(detection.detection.box));
      onChange(detection.descriptor, snapshot(detection.detection.box));
    } catch (err) {
      console.error("Detection error:", err);
      onError?.("Face detection failed. Try again.");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center gap-2">
        <span className="text-cyan-500"><CameraIcon /></span>
        <div className="text-[13px] font-semibold text-slate-800">{title}</div>
      </div>
      <div className="p-[18px]">
        <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {shownBox && (
            <div
              className="absolute border-2 border-cyan-400 rounded pointer-events-none"
              style={{ left: shownBox.left, top: shownBox.top, width: shownBox.width, height: shownBox.height }}
            />
          )}
          {!modelsLoaded && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/50">
              Preparing face recognition…
            </div>
          )}
          {modelsLoaded && !cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/50">
              Requesting camera access...
            </div>
          )}
        </div>

        <div className="flex gap-2.5 mt-4">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!cameraReady || detecting}
            className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {detecting ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Detecting...</>
            ) : (descriptor ? "Capture Again" : "Capture Face")}
          </button>
          {descriptor && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="px-4 py-2.5 rounded-lg border border-black/[0.12] text-slate-500 text-[13px] font-medium hover:bg-slate-50 transition-colors"
            >
              Retake
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-slate-400">
          {descriptor ? (
            <><span className="text-cyan-500"><CheckIcon /></span>128-point descriptor captured. The box should be on the worker's face.</>
          ) : ("Position the worker's face clearly in frame, facing the camera, in good light, then capture.")}
        </div>
      </div>
    </div>
  );
}
