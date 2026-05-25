import { smoothPath } from '../lib/smoothPath.js';
import { midiOf, isBlackKey } from '../lib/notes.js';
import PitchTrace from './PitchTrace.jsx';

export const PHRASE_PAD_TOP = 28;
export const PHRASE_PAD_BOTTOM = 22;
export const PHRASE_HEADER_HEIGHT = 30;

export default function Phrase({
  notes,
  singer = null,
  pitchMin,
  pitchMax,
  index,
  transpose = 0,
  pixelsPerBeat = 14,
  height,
  onHoverNote,
  onPlayNote,
  onPlayPhrase,
  onRowButton,
  buttonMode = 'play',
  buttonTitle = '',
  loopState = 'none',
  registerRef,
  micSamples,
  currentMicMidi,
  vocalRange,
}) {
  if (notes.length === 0) return null;

  const startBeat = notes[0].start;
  const lastNote = notes[notes.length - 1];
  const endBeat = lastNote.start + lastNote.duration;
  const beatSpan = Math.max(1, endBeat - startBeat);

  const contourWidth = beatSpan * pixelsPerBeat;
  const cellWidth = Math.max(96, contourWidth);

  const pitchRange = Math.max(1, pitchMax - pitchMin);
  const yOf = (pitch) =>
    PHRASE_PAD_TOP +
    (1 - (pitch - pitchMin) / pitchRange) *
      (height - PHRASE_PAD_TOP - PHRASE_PAD_BOTTOM);
  const xOf = (beat) => (beat - startBeat) * pixelsPerBeat;

  const points = notes.map((n) => ({
    x: xOf(n.start),
    y: yOf(n.pitch),
    w: n.duration * pixelsPerBeat,
    n,
  }));

  const gridLines = [];
  const gridStart = Math.ceil(pitchMin);
  const gridEnd = Math.floor(pitchMax);
  for (let p = gridStart; p <= gridEnd; p++) {
    const midi = midiOf(p, transpose);
    gridLines.push({ y: yOf(p), accidental: isBlackKey(midi) });
  }

  const singerClass = singer === 1 ? 'singer-1' : singer === 2 ? 'singer-2' : '';
  const singerStroke = singer === 2 ? 'var(--accent-soft)' : 'var(--accent)';

  return (
    <div
      ref={registerRef}
      className={`phrase-cell ${
        loopState !== 'none' ? `loop-${loopState}` : ''
      } ${singerClass}`}
      style={{ width: cellWidth }}
      onClick={() => onPlayPhrase?.(notes)}
    >
      <div className="phrase-header" style={{ height: PHRASE_HEADER_HEIGHT }}>
        <span className="phrase-num">
          {String(index + 1).padStart(2, '0')}
          {singer && <sup className={`singer-tag s${singer}`}>{singer}</sup>}
        </span>
        <button
          type="button"
          className={`phrase-play mode-${buttonMode}`}
          title={buttonTitle}
          aria-label={buttonTitle}
          onClick={(e) => {
            e.stopPropagation();
            onRowButton?.(index);
          }}
        >
          {buttonMode === 'play' ? '▶' : buttonMode === 'stop' ? '■' : '↻'}
        </button>
      </div>
      <svg width={cellWidth} height={height} className="phrase-svg">
        {vocalRange && (() => {
          const userLowPitch = vocalRange.low - 60 - transpose;
          const userHighPitch = vocalRange.high - 60 - transpose;
          const lowY = yOf(userLowPitch);
          const highY = yOf(userHighPitch);
          const top = Math.min(lowY, highY);
          const bottom = Math.max(lowY, highY);
          return (
            <g className="range-band">
              <rect
                x={0}
                y={top}
                width={cellWidth}
                height={Math.max(0, bottom - top)}
                fill="var(--in-range)"
                opacity="0.13"
              />
              <line
                x1={0}
                x2={cellWidth}
                y1={top}
                y2={top}
                stroke="var(--in-range)"
                strokeWidth="1"
                strokeDasharray="6 4"
                opacity="0.55"
              />
              <line
                x1={0}
                x2={cellWidth}
                y1={bottom}
                y2={bottom}
                stroke="var(--in-range)"
                strokeWidth="1"
                strokeDasharray="6 4"
                opacity="0.55"
              />
            </g>
          );
        })()}
        {gridLines.map((g, i) => (
          <line
            key={i}
            x1={0}
            x2={cellWidth}
            y1={g.y}
            y2={g.y}
            stroke="var(--rule)"
            strokeWidth="1"
            opacity={g.accidental ? 0.12 : 0.32}
            strokeDasharray={g.accidental ? '2 5' : ''}
          />
        ))}
        <path
          d={smoothPath(points)}
          stroke={singerStroke}
          strokeWidth="1.5"
          fill="none"
          opacity="0.35"
          strokeLinecap="round"
        />
        <PitchTrace
          samples={micSamples}
          phraseStart={startBeat}
          phraseEnd={endBeat}
          transpose={transpose}
          xOf={xOf}
          yOf={yOf}
          height={height}
          currentMicMidi={currentMicMidi}
          width={cellWidth}
        />
        {points.map((p, i) => (
          <g
            key={i}
            className="note-group"
            onMouseEnter={() => onHoverNote?.(midiOf(p.n.pitch, transpose))}
            onMouseLeave={() => onHoverNote?.(null)}
            onClick={(e) => {
              e.stopPropagation();
              onPlayNote?.(midiOf(p.n.pitch, transpose));
            }}
          >
            <rect
              x={p.x - 4}
              y={p.y - 22}
              width={Math.max(20, p.w + 4)}
              height={32}
              fill="transparent"
            />
            <line
              x1={p.x}
              y1={p.y + 4}
              x2={p.x + Math.max(8, p.w - 4)}
              y2={p.y + 4}
              stroke={singerStroke}
              strokeWidth="2"
              opacity={p.n.type === '*' ? 0.9 : 0.5}
              strokeLinecap="round"
            />
            <text
              x={p.x}
              y={p.y - 6}
              textAnchor="start"
              className="syllable"
              style={{ fontWeight: p.n.type === '*' ? 600 : 400 }}
            >
              {p.n.syllable.trim() || p.n.syllable || '·'}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
