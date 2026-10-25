// Face steps for the camera screens. Owner, 2026-10-22: no liveness check is
// asked anywhere any more (the Attendance Station records a recognized face
// right away; no blink, no head turns). Only HR face enrollment uses this, with
// the "front" step: a straight look, to capture a good picture. The blink and
// left/right steps are kept in advance() but nothing asks for them.
// Each video frame gives the face's 68 landmarks (face-api.js); from them the
// eye openness (eye aspect ratio) and the head turn (where the nose sits
// between the two sides of the jaw) are measured.
import * as faceapi from "face-api.js";

export const STEP_TEXT = {
  front: { title: "Look straight at the camera", sub: "Hold still for a moment" },
  blink: { title: "Blink your eyes", sub: "Just blink; you do not need to stand in any frame" },
  left: { title: "Turn your head to your left", sub: "Slowly, then face the camera again" },
  right: { title: "Turn your head to your right", sub: "Slowly, then face the camera again" },
};

// Time to finish the whole challenge, and the longest the face may be out of view.
export const CHALLENGE_MS = 30000;
export const LOST_FACE_MS = 4000;

// Fast detector for the challenge frames (the accurate one is used for recognition).
const FAST = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

let tinyPromise = null;
export function loadLivenessModels() {
  if (!tinyPromise) {
    tinyPromise = faceapi.nets.tinyFaceDetector.loadFromUri("/models").catch((err) => {
      tinyPromise = null;
      throw err;
    });
  }
  return tinyPromise;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Eye aspect ratio: about 0.3 with the eye open, under 0.2 when closed.
function eyeRatio(p) {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
}

// { eyes, turn }: eyes = openness of both eyes; turn = where the nose tip sits
// from one side of the jaw (0) to the other (1), 0.5 when facing the camera.
// In the camera picture (not mirrored) a turn to the person's own left moves
// the nose toward the picture's right, so turn goes up.
export function measure(landmarks) {
  const pts = landmarks.positions;
  const eyes = (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2;
  const left = pts[0], right = pts[16], nose = pts[30];
  const turn = (nose.x - left.x) / Math.max(1, right.x - left.x);
  return { eyes, turn };
}

// One fast frame: the face's measures and box, or null when no face.
export async function readFrame(video) {
  const d = await faceapi.detectSingleFace(video, FAST()).withFaceLandmarks();
  if (!d) return null;
  return { ...measure(d.landmarks), box: d.detection.box };
}

// A new challenge: a blink by default (Attendance Station); enrollment passes
// ["front"] for a straight look only.
export function newChallenge(steps = ["blink"]) {
  return {
    steps: [...steps], index: 0, startedAt: Date.now(), lastSeen: Date.now(),
    center: null, openEyes: 0, closed: false, turned: null, hint: "",
  };
}

export const currentStep = (c) => c.steps[c.index] || null;
export const isDone = (c) => c.index >= c.steps.length;

// How far the nose must move from the person's own straight position to count
// as a head turn, and how close to it counts as straight again.
const TURN = 0.1;
const STRAIGHT = 0.06;

// Moves the challenge on with one frame's measures (null: no face in this
// frame). Returns the challenge (changed in place); c.hint says what to do
// now. Everything is measured against the person's own face (their straight
// position and how open their eyes are), not fixed numbers, so it works for
// every face and camera angle.
export function advance(c, m) {
  if (!m) {
    c.hint = "No face found. Move closer and face the camera.";
    return c;
  }
  c.lastSeen = Date.now();
  c.hint = "";
  const step = currentStep(c);
  if (!step) return c;

  // The straight position: learned while facing the camera, kept up to date.
  if (c.center === null) c.center = m.turn;
  const off = m.turn - c.center;
  const straight = Math.abs(off) < STRAIGHT;
  if (straight) {
    c.center = c.center * 0.9 + m.turn * 0.1;
    c.openEyes = c.openEyes ? Math.max(c.openEyes * 0.97, m.eyes) : m.eyes;
  }

  if (step === "front") {
    // Roughly facing the camera (not a side view) for a moment
    if (Math.abs(m.turn - 0.5) < 0.18) {
      c.frontFrames = (c.frontFrames || 0) + 1;
      if (c.frontFrames >= 3) { c.center = m.turn; c.index++; }
    } else {
      c.frontFrames = 0;
      c.hint = "Face the camera straight.";
    }
  } else if (step === "blink") {
    if (!c.closed && c.openEyes > 0 && m.eyes < c.openEyes * 0.8) c.closed = true;
    else if (c.closed && m.eyes > c.openEyes * 0.9) { c.closed = false; c.index++; }
    else if (!straight) c.hint = "Face the camera, then blink.";
  } else {
    // A turn to either side is seen (cameras and mirrors differ); the step
    // asked for is ticked off, or the other side if that one is still to do.
    if (c.turned === null && Math.abs(off) > TURN) {
      const side = off > 0 ? "left" : "right";
      c.turned = side === step || !c.steps.slice(c.index).includes(side) ? step : side;
    } else if (c.turned !== null && straight) {
      const done = c.turned;
      c.turned = null;
      if (done === step) c.index++;
      else {
        // The other turn was done first: swap it in and move on.
        const at = c.steps.indexOf(done, c.index);
        [c.steps[c.index], c.steps[at]] = [c.steps[at], c.steps[c.index]];
        c.index++;
      }
    } else if (c.turned !== null) {
      c.hint = "Good. Now face the camera again.";
    }
  }
  return c;
}

// Why the challenge failed, or "" while it can still pass.
export function failure(c) {
  if (Date.now() - c.startedAt > CHALLENGE_MS) return "Time is up. Face the camera and try again.";
  if (Date.now() - c.lastSeen > LOST_FACE_MS) return "The face left the camera. Try again.";
  return "";
}
