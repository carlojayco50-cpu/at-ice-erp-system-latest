import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import brandLogo from "../assets/atice-logo.png";
import { SPLASH_EVENT } from "../lib/splash";
import { THEME_KEY } from "../lib/theme";
import Snowfall from "./Snowfall";

// Intro splash: the AT-ICE logo video (public/splash/intro.mp4) on a stage
// that follows the light/dark theme. Plays over the app for 2.2 seconds on
// every page load and reload, and after signing in, signing out and
// unlocking the kiosk.
//
//   stage   theme background with a slow cyan/violet aurora and soft snow;
//           on a page load or reload inside a module (not at login) it is
//           see-through and blurred, so the module behind still shows
//   orb     the video sits in a round dark "lens" whose edge fades out, so its
//           black background never shows as a square in either theme
//   title   AT-ICE wordmark and "Purified Ice Dealer" rise in under the orb
//   line    progress line filled in step with the splash time
//   exit    the stage fades out, revealing the page
//
// The logo picture shows first (and stays, if the video cannot play or the
// user prefers reduced motion), and the video fades in over it once ready.
// Only transform and opacity are animated, so it stays smooth on phones.
//
// Phones and tablets (owner, 2026-10-20) get a plain splash instead: only the
// logo, centered on the theme background, no video, snow, text or progress
// line. It shows only while the page is still loading and closes the moment
// loading is done (no fixed wait), and it does not replay on sign in or out.

const MotionDiv = motion.div;
const EASE = [0.22, 1, 0.36, 1];
const LENGTH = 2.2; // seconds, every time (page load, reload, sign in, sign out, kiosk unlock)
const EXIT = 0.6;

// A module page is behind the splash: someone is signed in and this is not the
// login page. Then the stage is see-through and blurred.
function overModule() {
  try {
    return !!localStorage.getItem("token") && !window.location.pathname.startsWith("/login");
  } catch {
    return false;
  }
}

// Theme of whoever is signed in (the customer portal keeps its own setting)
function isDark() {
  try {
    const key = localStorage.getItem("role") === "customer" ? "cp-theme" : THEME_KEY;
    const saved = localStorage.getItem(key);
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

// A phone or tablet: a narrow screen, or a touch screen with no mouse.
function isHandheld() {
  try {
    return !!window.matchMedia?.("(max-width: 1023px), (hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export default function SplashScreen() {
  const [handheld] = useState(isHandheld);
  return handheld ? <MobileSplash /> : <DesktopSplash />;
}

// The logo only, while the page loads.
const SAFETY_MS = 4000; // never block the app longer than this, even if a file stalls
function MobileSplash() {
  const [visible, setVisible] = useState(() => document.readyState !== "complete");
  const [dark] = useState(isDark);

  useEffect(() => {
    if (!visible) return undefined;
    const done = () => setVisible(false);
    window.addEventListener("load", done, { once: true });
    const cap = setTimeout(done, SAFETY_MS);
    return () => {
      window.removeEventListener("load", done);
      clearTimeout(cap);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Loading AT-ICE"
      className={`fixed inset-0 z-[1000] flex items-center justify-center ${dark ? "bg-[#070b14]" : "bg-[#e9eef5]"}`}
    >
      <img src={brandLogo} alt="AT-ICE" className="w-36 h-36 object-contain" draggable="false" />
    </div>
  );
}

function DesktopSplash() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const length = LENGTH;
  const [dark, setDark] = useState(isDark);
  // Page load or reload inside a module: see-through and blurred, so the page
  // behind shows. Never at login: sign in, sign out and kiosk unlock (every
  // replay below) keep the solid stage.
  const [overApp, setOverApp] = useState(overModule);
  const [videoReady, setVideoReady] = useState(false);
  // Bumped on every replay so the intro restarts from the beginning.
  const [run, setRun] = useState(0);

  // Replay on request: sign in, sign out, kiosk unlock (see lib/splash.js).
  useEffect(() => {
    const replay = () => {
      setDark(isDark());
      setOverApp(false);
      setVideoReady(false);
      setRun((n) => n + 1);
      setVisible(true);
    };
    window.addEventListener(SPLASH_EVENT, replay);
    return () => window.removeEventListener(SPLASH_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const ms = reduceMotion ? 1200 : length * 1000;
    const id = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(id);
  }, [visible, run, reduceMotion, length]);

  // Same layout and colors in both themes; only the tint changes. Signed in,
  // the tint is see-through over a blurred view of the module behind it.
  const stage = [
    dark ? "text-white" : "text-slate-800",
    overApp
      ? (dark ? "bg-[#070b14]/55" : "bg-[#e9eef5]/40") + " backdrop-blur-xl backdrop-saturate-150"
      : dark ? "bg-[#070b14]" : "bg-[#e9eef5]",
  ].join(" ");

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          key={`splash-${run}`}
          role="status"
          aria-label="Loading AT-ICE"
          className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden px-6 ${stage}`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT, ease: EASE }}
        >
          {/* Aurora: two soft color fields drifting slowly behind everything */}
          <MotionDiv
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/4 -top-1/4 h-[80vmax] w-[80vmax] rounded-full will-change-transform"
            style={{ background: dark ? "radial-gradient(circle, rgba(124,58,237,0.28), transparent 60%)" : "radial-gradient(circle, rgba(139,92,246,0.22), transparent 60%)" }}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: overApp ? 0.55 : 1, x: 0 }}
            transition={{ duration: length, ease: "easeOut" }}
          />
          <MotionDiv
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[80vmax] w-[80vmax] rounded-full will-change-transform"
            style={{ background: dark ? "radial-gradient(circle, rgba(34,211,238,0.24), transparent 60%)" : "radial-gradient(circle, rgba(34,211,238,0.24), transparent 60%)" }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: overApp ? 0.55 : 1, x: 0 }}
            transition={{ duration: length, ease: "easeOut" }}
          />

          <Snowfall className={dark ? "" : "snow-on-light"} />

          {/* Logo: the video with its black background made see-through, so
              only the snowflake shows, on either theme */}
          <MotionDiv
            className="relative w-[min(80vw,360px)] aspect-square"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            {/* soft glow behind the snowflake */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.45) 0%, rgba(34,211,238,0.28) 38%, transparent 68%)", opacity: dark ? 0.8 : 0.55 }}
            />
            {/* logo picture first; the video fades in over it once it plays */}
            <img
              src={brandLogo}
              alt=""
              className={`absolute inset-[4%] h-[92%] w-[92%] object-contain transition-opacity duration-500 ${videoReady ? "opacity-0" : "opacity-100"}`}
              style={{ filter: dark ? "drop-shadow(0 12px 30px rgba(34,211,238,0.25))" : "drop-shadow(0 14px 28px rgba(30,41,59,0.25))" }}
              draggable="false"
            />
            {!reduceMotion && (
              <KeyedVideo
                key={`video-${run}`}
                src="/splash/intro.mp4"
                onReady={() => setVideoReady(true)}
                className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${videoReady ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </MotionDiv>
          {/* Wordmark and tagline */}
          <MotionDiv
            className="relative mt-9 flex flex-col items-center text-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.8, ease: EASE }}
          >
            <div className="bg-[linear-gradient(90deg,#a78bfa,#f9a8d4_35%,#67e8f9_70%,#a78bfa)] bg-clip-text text-[clamp(28px,8vw,40px)] font-extrabold tracking-[0.18em] text-transparent">
              AT-ICE
            </div>
            <div className={`mt-1 text-[11px] font-medium uppercase tracking-[0.42em] ${dark ? "text-white/60" : "text-slate-500"}`}>
              Purified Ice Dealer
            </div>
          </MotionDiv>

          {/* Progress line, filled over the splash time */}
          <div className={`relative mt-8 h-[2px] w-[min(46vw,190px)] overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-slate-900/10"}`}>
            <MotionDiv
              className="absolute inset-0 origin-left rounded-full bg-[linear-gradient(90deg,#a78bfa,#22d3ee)] shadow-[0_0_10px_rgba(34,211,238,0.7)]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduceMotion ? 1.1 : length - 0.15, ease: [0.4, 0, 0.2, 1] }}
            />
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}

// Plays the logo video on a canvas and makes its black background see-through,
// so the snowflake floats on the splash in both themes. The work is done on the
// graphics chip (WebGL): each frame goes to the GPU as a texture and a small
// shader turns darkness into transparency, so the CPU stays free and the
// splash stays smooth on phones. The video element itself is invisible. If
// WebGL is not available, nothing is drawn and the logo picture stays.
const VERTEX = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAGMENT = `
precision mediump float;
uniform sampler2D frame;
varying vec2 uv;
void main() {
  vec3 c = texture2D(frame, uv).rgb;
  float a = smoothstep(0.055, 0.18, max(c.r, max(c.g, c.b)));
  gl_FragColor = vec4(c * a, a);
}`;

function KeyedVideo({ src, onReady, className }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!video || !gl) return undefined;

    // 720px: sharp for the 360px logo on 2x screens. A fixed size, because the
    // box is still animating in (and may measure 0) when this runs.
    canvas.width = 720;
    canvas.height = 720;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const shader = (type, text) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, text);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.clearColor(0, 0, 0, 0);

    let stopped = false;
    let announced = false;
    let handle = null;
    const useFrameCallback = typeof video.requestVideoFrameCallback === "function";

    const draw = () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!announced && video.currentTime > 0.3) { announced = true; onReady(); }
      }
      handle = useFrameCallback ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
    };

    video.currentTime = 0;
    video.play().then(draw).catch(() => { /* autoplay blocked: the logo picture stays */ });
    return () => {
      stopped = true;
      if (handle !== null) {
        if (useFrameCallback) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      }
      video.pause();
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
    // onReady comes from the parent and only flips a flag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* kept rendered (1px, invisible): some phones do not play a hidden video */}
      <video ref={videoRef} src={src} muted playsInline preload="auto" aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" />
      <canvas ref={canvasRef} className={className} aria-hidden="true" />
    </>
  );
}