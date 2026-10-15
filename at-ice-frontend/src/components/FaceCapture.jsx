import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { STEP_TEXT, advance, currentStep, failure, isDone, loadLivenessModels, newChallenge, readFrame } from "../lib/liveness";

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
      loadLivenessModels(),
    ]).catch((err) => {
      modelsPromise = null; // let the next try load again
      throw err;
    });
  }
  return modelsPromise;
}

// Webcam Capture card: live camera, a guided face scan (like GCash: look
// straight, then blink and turn the head left and right in a random order, see
// lib/liveness.js, so a photo cannot be enrolled), Retake, and a box on the
// detected face. The descriptor and picture saved are from the straight look,
// and the face at the end must be the same person. The parent keeps the 128-point descriptor: onChange gets
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
  // Guided scan in progress: { step, index, total } for the screen
  const [scan, setScan] = useState(null);
  const scanRef = useRef(null);
  useEffect(() => () => clearInterval(scanRef.current?.timer), []);

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

  const stopScan = () => {
    clearInterval(scanRef.current?.timer);
    scanRef.current = null;
    setScan(null);
    setDetecting(false);
  };

  // One frame of the guided scan: move the steps on; after the straight look
  // keep that face's descriptor and picture; at the end check it is still the
  // same face and hand it to the parent.
  const scanTick = async () => {
    const st = scanRef.current;
    const v = videoRef.current;
    if (!st || st.busy || !v) return;
    st.busy = true;
    try {
      const frame = await readFrame(v);
      if (scanRef.current !== st) return;
      const before = st.c.index;
      advance(st.c, frame);
      const failed = failure(st.c);
      if (failed) {
        stopScan();
        onError?.(failed);
        return;
      }
      if (before === 0 && st.c.index === 1) {
        const d = await faceapi.detectSingleFace(v).withFaceLandmarks().withFaceDescriptor();
        if (!d) { st.c.index = 0; return; }
        st.front = { descriptor: d.descriptor, photo: snapshot(d.detection.box), box: d.detection.box };
      }
      setScan({ step: currentStep(st.c), index: st.c.index, total: st.c.steps.length, hint: st.c.hint });
      if (!isDone(st.c)) return;

      const last = await faceapi.detectSingleFace(v).withFaceLandmarks().withFaceDescriptor();
      const front = st.front;
      stopScan();
      if (!front || !last || faceapi.euclideanDistance(last.descriptor, front.descriptor) > 0.5) {
        onError?.("The face changed during the scan. Scan again with the same person.");
        return;
      }
      setFaceBox(toScreenBox(front.box));
      onChange(front.descriptor, front.photo);
    } catch (err) {
      console.error("Face scan error:", err);
      stopScan();
      onError?.("Face detection failed. Try again.");
    } finally {
      st.busy = false;
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || scanRef.current) return;
    onChange(null, null);
    setDetecting(true);
    const c = newChallenge(["front"]);
    scanRef.current = { c, busy: false, front: null, timer: setInterval(scanTick, 120) };
    setScan({ step: currentStep(c), index: 0, total: c.steps.length });
  };

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center gap-2">
        <span className="text-cyan-500"><CameraIcon /></span>
        <div className="text-[13px] font-semibold text-slate-800">{title}</div>
      </div>
      <div className="p-[18px]">
        <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
          {/* Mirrored like a selfie camera; the face box is mirrored to match */}
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
          {scan && (
            <div className="absolute inset-0 flex flex-col items-center justify-between py-3 pointer-events-none" aria-live="polite">
              <div className="w-[30%] aspect-[3/4] rounded-[50%] border-[3px] border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] mt-2" />
              <div className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl bg-black/60 text-center">
                <div className="text-white text-[14px] font-semibold">
                  {scan.step === "left" && "← "}{STEP_TEXT[scan.step]?.title}{scan.step === "right" && " →"}
                </div>
                <div className="text-white/75 text-[11px]">{STEP_TEXT[scan.step]?.sub}</div>
                {scan.hint && <div className="text-amber-300 text-[11px] font-medium">{scan.hint}</div>}
                <div className="flex gap-1">
                  {Array.from({ length: scan.total }, (_, i) => (
                    <span key={i} className={`h-1 w-6 rounded-full ${i < scan.index ? "bg-emerald-400" : i === scan.index ? "bg-white" : "bg-white/30"}`} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {shownBox && (
            <div
              className="absolute border-2 border-cyan-400 rounded pointer-events-none"
              style={{ right: shownBox.left, top: shownBox.top, width: shownBox.width, height: shownBox.height }}
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
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Follow the steps on the camera…</>
            ) : (descriptor ? "Scan Again" : "Start Face Scan")}
          </button>
          {detecting && (
            <button
              type="button"
              onClick={stopScan}
              className="px-4 py-2.5 rounded-lg border border-black/[0.12] text-slate-500 text-[13px] font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {descriptor && !detecting && (
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
            <><span className="text-cyan-500"><CheckIcon /></span>Live face captured (blink and head turns passed). The box should be on the worker's face.</>
          ) : ("Start the scan, then the worker looks straight at the camera, blinks and turns the head left and right as asked. A photo will not pass.")}
        </div>
      </div>
    </div>
  );
}
