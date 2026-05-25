import { MIDI_C4 } from '../lib/notes.js';

export default function PitchTrace({
  samples,
  phraseStart,
  phraseEnd,
  transpose,
  xOf,
  yOf,
  height,
  width,
  currentMicMidi,
}) {
  const clamp = (y) => Math.max(-4, Math.min(height + 4, y));

  const segments = [];
  let current = [];

  const flush = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };

  if (samples && samples.length > 0) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.beat < phraseStart || s.beat > phraseEnd) {
        flush();
        continue;
      }
      if (!s.voiced || s.midi == null) {
        flush();
        continue;
      }
      const pitch = s.midi - MIDI_C4 - transpose;
      current.push({ x: xOf(s.beat), y: clamp(yOf(pitch)) });
    }
    flush();
  }

  let liveY = null;
  if (currentMicMidi != null) {
    const pitch = currentMicMidi - MIDI_C4 - transpose;
    liveY = clamp(yOf(pitch));
  }

  if (segments.length === 0 && liveY == null) return null;

  return (
    <g className="pitch-trace">
      {liveY != null && (
        <>
          <line
            x1={0}
            x2={width}
            y1={liveY}
            y2={liveY}
            stroke="var(--trace)"
            strokeWidth="1.25"
            strokeDasharray="3 5"
            opacity="0.55"
          />
          <circle
            cx={6}
            cy={liveY}
            r={3.5}
            fill="var(--trace)"
            opacity="0.85"
          />
        </>
      )}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
          fill="none"
          stroke="var(--trace)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      ))}
    </g>
  );
}
