import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import { clearKioskToken, kioskHeaders } from "../lib/kiosk";
import { playKioskSound, primeKioskSound } from "../lib/kioskSound";
import { STEP_TEXT, advance, currentStep, failure, isDone, loadLivenessModels, newChallenge, readFrame } from "../lib/liveness";
import { formatTime } from "../lib/time";

const ScanIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const CheckIcon = () => (
  <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const XIcon = () => (
  <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ClockIcon = () => (
  <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const LogInIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);
const LogOutIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MATCH_THRESHOLD = 0.5;
const DETECTION_INTERVAL_MS = 1500;
// Frames are read this often during the liveness challenge (a blink is short).
const LIVENESS_FRAME_MS = 120;
// The result pop-up in the middle of the screen stays this long.
const RESULT_DISPLAY_MS = 3500;

// "2026-10-07" + "08:05:12" from the server -> a Date in local time
const recordedAt = (date, time) => {
  if (!date || !time) return null;
  const d = new Date(`${String(date).slice(0, 10)}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
};
// After any result, the same worker is ignored for this long in the SAME
// mode, so standing in front of the camera does not post again and again.
// Switching the toggle (Time In to Time Out) is allowed right away.
const SAME_WORKER_COOLDOWN_MS = 60_000;

// Time In is green, Time Out is orange (adviser's request).
const MODES = {
  time_in: {
    label: "Time In",
    hint: "Select this when you arrive",
    activeBtn: "bg-emerald-500 text-white border-emerald-500 shadow-[inset_3px_3px_8px_rgba(6,78,59,0.45),inset_-3px_-3px_8px_rgba(255,255,255,0.15)]",
    idleBtn: "bg-[var(--neu-bg)] text-emerald-700 border-transparent shadow-[var(--neu-raised-sm)] hover:text-emerald-600",
    ring: "ring-emerald-500",
    pill: "bg-emerald-500/20 text-emerald-300",
    dot: "bg-emerald-400",
    text: "text-emerald-600",
  },
  time_out: {
    label: "Time Out",
    hint: "Select this when you leave",
    activeBtn: "bg-orange-500 text-white border-orange-500 shadow-[inset_3px_3px_8px_rgba(124,45,18,0.45),inset_-3px_-3px_8px_rgba(255,255,255,0.15)]",
    idleBtn: "bg-[var(--neu-bg)] text-orange-700 border-transparent shadow-[var(--neu-raised-sm)] hover:text-orange-600",
    ring: "ring-orange-500",
    pill: "bg-orange-500/20 text-orange-300",
    dot: "bg-orange-400",
    text: "text-orange-600",
  },
};

export default function AttendanceStation() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const faceMatcherRef = useRef(null);
  const busyRef = useRef(false);
  const recentlyMarkedRef = useRef(new Map());
  const modeRef = useRef("time_in");

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [descriptorsLoaded, setDescriptorsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [mode, setMode] = useState("time_in");
  const resultTimerRef = useRef(null);
  // The liveness challenge in progress: { label, mode, descriptor, info, c } (ref,
  // read by the loop) and { step, index, total, name } (state, for the screen).
  const challengeRef = useRef(null);
  const [challenge, setChallenge] = useState(null);

  const changeMode = (next) => {
    modeRef.current = next; // the detection loop reads the ref, not the state
    challengeRef.current = null; // a challenge started for the other mode is dropped
    setChallenge(null);
    setMode(next);
    clearTimeout(resultTimerRef.current);
    setResult(null);
  };

  // Shows a result in the pop-up for RESULT_DISPLAY_MS. Only a recorded Time In
  // or Time Out plays a tone. A new result replaces the one on screen and
  // restarts the timer.
  const showResult = useCallback((r) => {
    playKioskSound(r.status);
    clearTimeout(resultTimerRef.current);
    setResult({ ...r, at: r.at || new Date() });
    resultTimerRef.current = setTimeout(() => setResult(null), RESULT_DISPLAY_MS);
  }, []);

  useEffect(() => primeKioskSound(), []);
  useEffect(() => () => clearTimeout(resultTimerRef.current), []);

  // live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load models + descriptors
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          loadLivenessModels(),
        ]);
        if (cancelled) return;
        setModelsLoaded(true);

        const res = await fetch("/api/face-descriptors", { headers: kioskHeaders() });
        if (res.status === 403) {
          // The kiosk was locked (PIN changed or token expired): the gate asks for the PIN again.
          clearKioskToken();
          window.location.reload();
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const labeledDescriptors = data.map(
          (entry) => new faceapi.LabeledFaceDescriptors(String(entry.id), [new Float32Array(entry.descriptor)])
        );

        if (labeledDescriptors.length === 0) {
          setLoadError("No enrolled faces found. Enroll workers first in HR > Employees (Face).");
          return;
        }

        window.__faceLookup = Object.fromEntries(
          data.map((entry) => [String(entry.id), { name: entry.worker_name, role: entry.role }])
        );

        faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
        setDescriptorsLoaded(true);
      } catch (err) {
        console.error("Init error:", err);
        setLoadError("Failed to load models or face descriptors.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Start webcam
  useEffect(() => {
    if (!modelsLoaded || !descriptorsLoaded) return;
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
        setLoadError("Could not access webcam. Check browser permissions.");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [modelsLoaded, descriptorsLoaded]);

  // Records attendance via POST /api/attendances (no user login, this is a kiosk;
  // the kiosk token in the X-Kiosk-Token header proves the terminal was unlocked by HR). The kiosk sends the matched face id and the
  // selected mode (time_in or time_out). The server decides the date and
  // the time. Returns { type, hours } where type is time_in, time_out,
  // already_timed_in, no_time_in, completed, inactive or error.
  const recordAttendance = useCallback(async (faceDataId, type) => {
    try {
      const res = await fetch("/api/attendances", {
        method: "POST",
        headers: kioskHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ face_data_id: Number(faceDataId), type }),
      });
      if (res.status === 403) {
        // Locked while someone was scanning: nothing was recorded. Ask for the PIN again.
        clearKioskToken();
        window.location.reload();
        return { type: "error" };
      }
      const data = await res.json().catch(() => null);
      if (data?.type) {
        // The server's own date and time of the record (Asia/Manila)
        const a = data.attendance;
        const at = a ? recordedAt(a.date, data.type === "time_out" ? a.time_out : a.time_in) : null;
        return { type: data.type, hours: data.hours_worked, at };
      }
      console.error("Attendance post failed:", res.status, data);
      return { type: "error" };
    } catch (err) {
      console.warn("Attendance post error:", err);
      return { type: "error" };
    }
  }, []);

  // Detection loop. A recognized face is not recorded straight away: the
  // worker first passes the liveness challenge (lib/liveness.js: blink and
  // turn the head left and right, in a random order), so a photo or a phone
  // screen held to the camera is refused. The face at the end must still be
  // the same worker.
  useEffect(() => {
    if (!cameraReady || !faceMatcherRef.current) return;
    let fastTimer = null;

    const endChallenge = () => {
      clearInterval(fastTimer);
      fastTimer = null;
      challengeRef.current = null;
      setChallenge(null);
    };

    // Fast frames while a challenge runs
    const fastTick = async () => {
      const ch = challengeRef.current;
      if (!ch || ch.busy || !videoRef.current) return;
      ch.busy = true;
      try {
        const frame = await readFrame(videoRef.current);
        if (challengeRef.current !== ch) return;
        advance(ch.c, frame);
        const failed = failure(ch.c);
        if (failed) {
          endChallenge();
          showResult({ status: "liveness", name: ch.info?.name, role: ch.info?.role, detail: failed });
          return;
        }
        setChallenge({ step: currentStep(ch.c), index: ch.c.index, total: ch.c.steps.length, name: ch.info?.name, hint: ch.c.hint });
        if (!isDone(ch.c)) return;

        // Passed: check it is still the same face, then record.
        const last = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
        endChallenge();
        if (!last || faceapi.euclideanDistance(last.descriptor, ch.descriptor) > MATCH_THRESHOLD
            || faceMatcherRef.current.findBestMatch(last.descriptor).label !== ch.label) {
          showResult({ status: "liveness", name: ch.info?.name, detail: "The face changed during the check. Try again." });
          return;
        }
        const { type, hours, at } = await recordAttendance(ch.label, ch.mode);
        if (type !== "error") recentlyMarkedRef.current.set(`${ch.label}:${ch.mode}`, Date.now());
        showResult({ status: type, name: ch.info?.name, role: ch.info?.role, hours, at });
      } catch (err) {
        console.error("Liveness tick error:", err);
      } finally {
        ch.busy = false;
      }
    };

    const tick = async () => {
      if (busyRef.current || challengeRef.current || !videoRef.current) return;
      busyRef.current = true;
      try {
        const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
        if (!detection) return;

        const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);

        if (bestMatch.label === "unknown") {
          showResult({ status: "no-match" });
          return;
        }
        const faceDataId = bestMatch.label;
        const currentMode = modeRef.current;
        const lastMarked = recentlyMarkedRef.current.get(`${faceDataId}:${currentMode}`);
        if (lastMarked && Date.now() - lastMarked < SAME_WORKER_COOLDOWN_MS) {
          // Same worker, same mode, still in front of the camera: do not post again
          return;
        }

        clearTimeout(resultTimerRef.current);
        setResult(null);
        challengeRef.current = {
          label: faceDataId,
          mode: currentMode,
          descriptor: detection.descriptor,
          info: window.__faceLookup?.[faceDataId],
          c: newChallenge(),
          busy: false,
        };
        setChallenge({ step: currentStep(challengeRef.current.c), index: 0, total: challengeRef.current.c.steps.length, name: challengeRef.current.info?.name });
        fastTimer = setInterval(fastTick, LIVENESS_FRAME_MS);
      } catch (err) {
        console.error("Detection tick error:", err);
      } finally {
        busyRef.current = false;
      }
    };

    intervalRef.current = setInterval(tick, DETECTION_INTERVAL_MS);
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(fastTimer);
      challengeRef.current = null;
    };
  }, [cameraReady, recordAttendance, showResult]);

  const statusConfig = {
    time_in:          { label: "Time In Recorded",    sub: "Proceed to the fingerprint scanner", bg: "bg-emerald-600/90", tone: "#059669", icon: <CheckIcon /> },
    time_out:         { label: "Time Out Recorded",   sub: "Proceed to the fingerprint scanner", bg: "bg-orange-500/90", tone: "#ea580c",  icon: <CheckIcon /> },
    already_timed_in: { label: "Already Timed In",    sub: "Select Time Out at the end of your shift", bg: "bg-amber-600/90", tone: "#d97706", icon: <ClockIcon /> },
    no_time_in:       { label: "No Time In Found",    sub: "Select Time In first, or inform HR", bg: "bg-amber-600/90", tone: "#d97706", icon: <ClockIcon /> },
    completed:        { label: "Done for Today",      sub: "Time In and Time Out are already recorded", bg: "bg-amber-600/90", tone: "#d97706", icon: <ClockIcon /> },
    inactive:         { label: "Not Active",          sub: "This employee is no longer active. Please inform HR.", bg: "bg-red-600/90", tone: "#dc2626", icon: <XIcon /> },
    "no-match":       { label: "Face Not Recognized", sub: "Not enrolled in the system. Please see HR.", bg: "bg-red-600/90", tone: "#dc2626", icon: <XIcon /> },
    liveness:         { label: "Live Check Not Passed", sub: "Nothing was recorded. Face the camera and follow the steps.", bg: "bg-red-600/90", tone: "#dc2626", icon: <XIcon /> },
    error:            { label: "Could Not Record",    sub: "Please try again or inform HR", bg: "bg-red-600/90", tone: "#dc2626", icon: <XIcon /> },
  };
  const active = result ? statusConfig[result.status] || statusConfig.error : null;
  const m = MODES[mode];

  return (
    <div className="relative w-full min-h-screen flex items-center justify-center overflow-hidden font-sans">

      {/* Background (same as the login page) */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-2xl mx-4">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-sm mb-4">
          <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">AT-ICE ERP</div>
          <div className="flex items-center gap-1.5 mt-3 px-3.5 py-1.5 bg-cyan-500/[0.15] border border-cyan-500/30 rounded-full backdrop-blur-sm">
            <span className="text-cyan-400"><ScanIcon /></span>
            <span className="text-[12px] font-medium text-cyan-300 tracking-wide">Attendance Station</span>
          </div>
        </div>

        {/* Camera card */}
        <div className="bg-[var(--neu-bg)] rounded-[28px] shadow-2xl shadow-black/30 overflow-hidden">
          <div className="px-5 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-[rgba(163,177,198,0.4)] flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">Face Recognition Check-In</h2>
              <p className="text-[13px] text-[var(--neu-faint)] mt-1">Choose Time In or Time Out below, face the camera, then blink and turn your head when asked.</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[15px] font-semibold text-slate-800 font-mono">
                {formatTime(clock, { seconds: true })}
              </div>
              <div className="text-[11px] text-[var(--neu-faint)]">
                {clock.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>

          <div className="px-5 sm:px-8 py-6">
            <div className={`relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-[var(--neu-inset)] ring-4 ${m.ring} transition-shadow`}>
              {/* Shown like a mirror, so "turn left" matches what the worker sees */}
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />

              {/* Liveness challenge: only the oval guide and a greeting sit on the
                  camera, so nothing covers the face; the step to do is shown
                  under the camera */}
              {challenge && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%] truncate px-3.5 py-1.5 rounded-full bg-black/55 text-white text-[12px] font-medium backdrop-blur-sm">
                    {challenge.name ? `Hi ${challenge.name.split(" ")[0]}! ` : ""}Quick live check
                  </div>
                  <div className="absolute inset-0 m-auto h-[64%] aspect-[3/4] rounded-[50%] border-[3px] border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                </div>
              )}

              {(!modelsLoaded || !descriptorsLoaded || !cameraReady) && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-[13px] gap-2.5 flex-col">
                  <span className="w-6 h-6 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />
                  {!modelsLoaded ? "Loading face recognition models..." : !descriptorsLoaded ? "Loading enrolled workers..." : "Starting camera..."}
                </div>
              )}

              {loadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-[13px] text-center px-8">
                  {loadError}
                </div>
              )}

              {!result && !challenge && cameraReady && !loadError && (
                <div className={`absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 backdrop-blur-sm rounded-full ${m.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${m.dot}`} />
                  <span className="text-[11px] font-medium tracking-wide">Scanning for {m.label}</span>
                </div>
              )}
            </div>

            {/* What to do now: the live-check step, or what the camera is
                waiting for. Always the same height, so the page never jumps. */}
            <div className="mt-4 min-h-[76px] rounded-2xl px-4 py-3 shadow-[var(--neu-inset-sm)] flex flex-col items-center justify-center text-center" aria-live="polite">
              {challenge ? (
                <>
                  <div className="flex items-center gap-2 text-[17px] font-semibold text-slate-800">
                    {challenge.step === "left" && <span aria-hidden="true">←</span>}
                    {STEP_TEXT[challenge.step]?.title}
                    {challenge.step === "right" && <span aria-hidden="true">→</span>}
                  </div>
                  <div className="text-[12px] text-[var(--neu-muted)]">
                    {challenge.hint ? <span className="font-medium text-amber-700">{challenge.hint}</span> : STEP_TEXT[challenge.step]?.sub}
                  </div>
                  <div className="flex gap-1.5 mt-1.5" aria-label={`Step ${challenge.index + 1} of ${challenge.total}`}>
                    {Array.from({ length: challenge.total }, (_, i) => (
                      <span key={i} className={`h-1.5 w-8 rounded-full ${i < challenge.index ? "bg-emerald-500" : i === challenge.index ? "bg-cyan-600" : "bg-slate-300"}`} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[15px] font-semibold text-slate-800">{cameraReady && !loadError ? `Ready for ${m.label}` : "Getting ready…"}</div>
                  <div className="text-[12px] text-[var(--neu-muted)]">Stand in front of the camera. The live check starts when your face is found.</div>
                </>
              )}
            </div>

            {/* Time In / Time Out toggle: Time In green, Time Out orange */}
            <div className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(MODES).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => changeMode(key)}
                    aria-pressed={mode === key}
                    className={`flex flex-col items-center justify-center gap-0.5 py-4 rounded-xl border-2 text-[17px] font-semibold cursor-pointer transition-all ${
                      mode === key ? cfg.activeBtn : cfg.idleBtn
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {key === "time_in" ? <LogInIcon /> : <LogOutIcon />}
                      {cfg.label}
                    </span>
                    <span className={`text-[11px] font-normal ${mode === key ? "text-white/80" : "text-[var(--neu-faint)]"}`}>
                      {cfg.hint}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-center text-[12px] text-[var(--neu-muted)] mt-3">
                Mode selected: <span className={`font-semibold ${m.text}`}>{m.label}</span>
              </p>
            </div>

            <p className="text-center text-[11px] text-[var(--neu-faint)] mt-4">
              Step 1: Face recognition (this screen). Step 2: Fingerprint on the existing biometric scanner.
            </p>
          </div>
        </div>

        <p className="text-center text-[10px] text-white/30 mt-5 tracking-wide">
          © 2026 AT-ICE ERP · Attendance Station v1.1
        </p>
      </div>

      {/* Result pop-up: a small card in the middle of the screen with the
          result, the worker, and the date and time of the record. It closes
          by itself after RESULT_DISPLAY_MS; the page behind stays as it is. */}
      {active && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none" role="alert" aria-live="assertive">
          {/* A new result pops in again; an unknown face that stays in front of the camera does not flicker */}
          <div
            key={result.status === "no-match" ? "no-match" : result.at.getTime()}
            className="kiosk-pop w-full max-w-[300px] rounded-2xl bg-[var(--neu-bg)] shadow-[var(--float-shadow)] overflow-hidden"
            style={{ "--tone": active.tone }}
          >
            <div className="px-5 pt-5 pb-4 flex items-start gap-3">
              <div className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-white bg-[var(--tone)] [&>svg]:w-5 [&>svg]:h-5">
                {active.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-tight text-[var(--tone)]">{active.label}</div>
                {result.name && (
                  <div className="text-[13px] font-medium text-slate-800 leading-snug mt-0.5 truncate">
                    {result.name}{result.role && <span className="font-normal text-[var(--neu-muted)] capitalize"> · {result.role}</span>}
                  </div>
                )}
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="text-[17px] font-semibold font-mono tracking-tight text-slate-800 leading-none">
                    {formatTime(result.at, { seconds: true })}
                  </span>
                  <span className="text-[12px] text-[var(--neu-muted)]">
                    {result.at.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {result.status === "time_out" && result.hours != null && (
                  <div className="text-[12px] text-slate-700 mt-1">Hours worked: <b>{result.hours}</b></div>
                )}
                <div className="text-[11px] text-[var(--neu-faint)] mt-1.5">{result.detail || active.sub}</div>
              </div>
            </div>
            <div className="h-[3px] bg-black/5">
              <div className="kiosk-pop-timer h-full bg-[var(--tone)]" style={{ animationDuration: `${RESULT_DISPLAY_MS}ms` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}