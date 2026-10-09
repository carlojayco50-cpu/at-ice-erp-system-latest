// Short tones for the Attendance Station results, made with the Web Audio API
// (no sound files). Time In rises, Time Out falls. Every other result (not
// recorded, unknown face, error) is silent.
//
// Browsers only allow sound after the user has interacted with the page. The
// kiosk is unlocked with the HR PIN, and every tap or key press here also
// wakes the audio, so the tones play once the station is in use.

let ctx = null;

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Wake the audio on the first interaction (and keep it awake).
export function primeKioskSound() {
  const wake = () => audio();
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake);
  return () => {
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
}

// notes: [frequency Hz, start s, length s]
function play(notes, { type = "sine", volume = 0.22 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.02;
  for (const [freq, start, len] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + start);
    gain.gain.linearRampToValueAtTime(volume, t0 + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + len + 0.05);
  }
}

const SOUNDS = {
  time_in: () => play([[660, 0, 0.18], [880, 0.14, 0.32]]),
  time_out: () => play([[880, 0, 0.18], [587, 0.14, 0.34]]),
};

export function playKioskSound(status) {
  try {
    // Only a recorded Time In or Time Out has a tone; every other result is silent.
    if (status === "time_in" || status === "time_out") SOUNDS[status]();
  } catch {
    // no sound is not worth breaking the scan for
  }
}
