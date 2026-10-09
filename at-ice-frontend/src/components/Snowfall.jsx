// Falling snow over a dark background (splash screen). Pure CSS: every flake
// is one div animated by the snow-fall keyframes in index.css. The flakes are
// made once at module load, so a replay of the splash does not reshuffle them.
// Negative delays start the snow mid-fall, so the screen is never empty.
// Hidden for users who prefer reduced motion.

const rand = (min, max) => min + Math.random() * (max - min);

function makeFlakes(count) {
  return Array.from({ length: count }, (_, i) => {
    // Three depth layers: far flakes are small, dim and slow.
    const depth = i % 3;
    const size = [rand(2, 3.5), rand(3.5, 5.5), rand(6, 9)][depth];
    const dur = [rand(11, 15), rand(8, 11), rand(5.5, 8)][depth];
    return {
      left: `${rand(0, 100)}%`,
      size: `${size}px`,
      opacity: [0.45, 0.7, 0.9][depth],
      dur: `${dur}s`,
      delay: `${-rand(0, dur)}s`,
      drift: `${rand(-60, 60)}px`,
      sway: `${rand(-25, 25)}px`,
    };
  });
}

// 60 flakes, no blur filter: light enough to stay smooth on phones
const FLAKES = makeFlakes(60);

export default function Snowfall({ className = "" }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            "--dur": f.dur,
            "--delay": f.delay,
            "--drift": f.drift,
            "--sway": f.sway,
          }}
        />
      ))}
    </div>
  );
}
