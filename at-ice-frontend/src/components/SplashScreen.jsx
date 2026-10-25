import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import brandLogo from "../assets/atice-logo.png";
import { SPLASH_EVENT } from "../lib/splash";
import Snowfall from "./Snowfall";

// Intro splash: the AT-ICE logo video (public/splash/intro.mp4) on a night
// stage (owner, 2026-10-22: always dark, no light version). Admin and HR on a
// computer get the full intro below, for 2.2 seconds on every page load and
// reload, and after signing in and signing out. Everyone else (Checker,
// Salesman, Maintenance, Driver, customers, the login and kiosk screens) and
// every phone or tablet gets the plain logo splash (MobileSplash).
//
//   stage   solid night background with a soft cyan/violet aurora and light snow
//   logo    the logo video (its black made see-through), with a soft shadow
//   tagline "Purified Ice Dealer" under the logo (the logo itself reads AT-ICE)
//   line    a thin progress line filled in step with the splash time
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

// A phone or tablet: a narrow screen, or a touch screen with no mouse.
function isHandheld() {
  try {
    return !!window.matchMedia?.("(max-width: 1023px), (hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

// The full intro is for Admin and HR on a computer only.
const FULL_ROLES = ["admin", "hr"];
function fullIntro() {
  try {
    // a role left behind without a token (signed out) does not count
    return !isHandheld() && !!localStorage.getItem("token") && FULL_ROLES.includes(localStorage.getItem("role"));
  } catch {
    return false;
  }
}

export default function SplashScreen() {
  // Which splash, decided again on every replay (sign in and sign out set or
  // still hold the role when the replay is asked for); run remounts the intro.
  const [state, setState] = useState(() => ({ full: fullIntro(), run: 0 }));
  useEffect(() => {
    const replay = () => setState((s) => ({ full: fullIntro(), run: s.run + 1 }));
    window.addEventListener(SPLASH_EVENT, replay);
    return () => window.removeEventListener(SPLASH_EVENT, replay);
  }, []);

  if (state.full) return <DesktopSplash key={state.run} />;
  // the plain logo shows on page load only; it does not replay
  return state.run === 0 ? <MobileSplash /> : null;
}

// The logo only, while the page loads.
const SAFETY_MS = 4000; // never block the app longer than this, even if a file stalls
function MobileSplash() {
  const [visible, setVisible] = useState(() => document.readyState !== "complete");

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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#070b14]"
    >
      <img src={brandLogo} alt="AT-ICE" className="splash-breathe w-56 h-56 object-contain" draggable="false" />
    </div>
  );
}

function DesktopSplash() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const length = LENGTH;
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const ms = reduceMotion ? 1200 : length * 1000;
    const id = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(id);
  }, [visible, reduceMotion, length]);

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          key="splash"
          role="status"
          aria-label="Loading AT-ICE"
          className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden px-6 bg-[#070b14] text-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT, ease: EASE }}
        >
          {/* Aurora: two soft color fields drifting slowly behind everything */}
          <MotionDiv
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/4 -top-1/4 h-[80vmax] w-[80vmax] rounded-full will-change-transform"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,0.16), transparent 62%)" }}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: length, ease: "easeOut" }}
          />
          <MotionDiv
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[80vmax] w-[80vmax] rounded-full will-change-transform"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.14), transparent 62%)" }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: length, ease: "easeOut" }}
          />

          <Snowfall className="opacity-60" />

          {/* Logo: the video with its black background made see-through, so
              only the snowflake shows. It eases in, then keeps coming forward
              slowly for the whole splash (outer) while it breathes (inner).
              Only transform and opacity move, on the GPU, so it stays smooth. */}
          <MotionDiv
            className="relative w-[min(78vw,440px)] aspect-square"
            style={{ willChange: "transform, opacity" }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: [0.86, 1, 1.07] }}
            transition={{
              opacity: { duration: 0.7, ease: EASE },
              scale: { duration: length + EXIT, times: [0, 0.35, 1], ease: [EASE, [0.37, 0, 0.63, 1]] },
            }}
          >
            <MotionDiv
              className="absolute inset-0"
              style={{ willChange: "transform" }}
              animate={reduceMotion ? undefined : { scale: [1, 1.035, 1] }}
              transition={{ duration: 1.8, delay: 0.5, ease: [0.37, 0, 0.63, 1], repeat: Infinity }}
            >
              {/* logo picture first; the video fades in over it once it plays */}
              <img
                src={brandLogo}
                alt=""
                className={`absolute inset-[4%] h-[92%] w-[92%] object-contain transition-opacity duration-500 ${videoReady ? "opacity-0" : "opacity-100"}`}
                style={{ filter: "drop-shadow(0 14px 24px rgba(0,0,0,0.45))" }}
                draggable="false"
              />
              {!reduceMotion && (
                <KeyedVideo
                  key="video"
                  src="/splash/intro.mp4"
                  onReady={() => setVideoReady(true)}
                  className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${videoReady ? "opacity-100" : "opacity-0"}`}
                />
              )}
            </MotionDiv>
          </MotionDiv>
          {/* Tagline (the logo above already reads AT-ICE) */}
          <MotionDiv
            className="relative mt-6 text-center text-[12px] font-medium uppercase tracking-[0.36em] text-cyan-100/75"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.8, ease: EASE }}
          >
            Purified Ice Dealer
          </MotionDiv>

          {/* Progress line, filled over the splash time */}
          <div className="relative mt-7 h-[2px] w-[min(40vw,160px)] overflow-hidden rounded-full bg-white/10">
            <MotionDiv
              className="absolute inset-0 origin-left rounded-full bg-cyan-400"
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

    // 960px: sharp for the 440px logo on 2x screens. A fixed size, because the
    // box is still animating in (and may measure 0) when this runs.
    canvas.width = 960;
    canvas.height = 960;
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