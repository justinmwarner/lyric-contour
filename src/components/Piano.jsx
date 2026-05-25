import { useEffect, useMemo, useRef, useState } from 'react';
import { isBlackKey, noteName, solfege } from '../lib/notes.js';
import { ensureAudio, playNote } from '../lib/audio.js';
import { usePersistedState } from '../lib/usePersistedState.js';

const LOWER_ROW = 'zsxdcvgbhnjm,'.split('');
const UPPER_ROW = 'q2w3er5t6y7u'.split('');

function buildKeys(lowMidi, highMidi) {
  const keys = [];
  for (let m = lowMidi; m <= highMidi; m++) {
    keys.push({ midi: m, black: isBlackKey(m) });
  }
  return keys;
}

const VOICE_OPTIONS = [
  ['piano', 'Piano'],
  ['sine', 'Sine'],
  ['strings', 'Strings'],
];

export default function Piano({
  lowMidi = 48,
  highMidi = 84,
  highlightMidi = null,
  centerMidi = 60,
  labelMode = 'letters',
  voice = 'piano',
  onVoiceChange,
  playingMidis = null,
  micMidi = null,
}) {
  const [octaveShift, setOctaveShift] = usePersistedState('lc-piano-octave', 0);
  const [pressed, setPressed] = useState(() => new Set());
  const scrollerRef = useRef(null);
  const centerKeyRef = useRef(null);

  const keys = useMemo(() => buildKeys(lowMidi, highMidi), [lowMidi, highMidi]);
  const whiteKeys = keys.filter((k) => !k.black);
  const blackKeys = keys.filter((k) => k.black);

  const keyMap = useMemo(() => {
    const map = new Map();
    const baseLower = 48 + octaveShift * 12;
    LOWER_ROW.forEach((ch, i) => map.set(ch, baseLower + i));
    const baseUpper = 60 + octaveShift * 12;
    UPPER_ROW.forEach((ch, i) => map.set(ch, baseUpper + i));
    return map;
  }, [octaveShift]);

  const isPressed = (midi) => pressed.has(midi) || midi === highlightMidi;
  const micRounded = micMidi != null ? Math.round(micMidi) : null;
  const keyState = (midi) => {
    if (isPressed(midi)) return 'pressed';
    if (micRounded != null && midi === micRounded) return 'mic';
    if (playingMidis && playingMidis.has(midi)) return 'playing';
    return '';
  };

  const trigger = (midi) => {
    ensureAudio();
    playNote(midi, 0.6);
    setPressed((prev) => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
    setTimeout(() => {
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    }, 220);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      if (e.key === '[') {
        setOctaveShift((s) => Math.max(-3, s - 1));
        return;
      }
      if (e.key === ']') {
        setOctaveShift((s) => Math.min(3, s + 1));
        return;
      }
      const midi = keyMap.get(e.key.toLowerCase());
      if (midi != null && midi >= lowMidi && midi <= highMidi) {
        e.preventDefault();
        trigger(midi);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyMap, lowMidi, highMidi]);

  useEffect(() => {
    if (!centerKeyRef.current || !scrollerRef.current) return;
    const key = centerKeyRef.current;
    const scroller = scrollerRef.current;
    const left = key.offsetLeft - scroller.clientWidth / 2 + key.clientWidth / 2;
    scroller.scrollTo({ left, behavior: 'instant' in scroller ? 'instant' : 'auto' });
  }, [centerMidi, lowMidi, highMidi]);

  const whiteKeyWidth = 36;
  const blackKeyWidth = 22;
  const totalWidth = whiteKeys.length * whiteKeyWidth;

  return (
    <div className="piano">
      <div className="piano-hint">
        <span className="piano-voice-group">
          <span>Sound:</span>
          {VOICE_OPTIONS.map(([v, label]) => (
            <button
              key={v}
              className={`pill piano-voice-pill ${voice === v ? 'on' : ''}`}
              onClick={() => onVoiceChange?.(v)}
            >
              {label}
            </button>
          ))}
        </span>
        <span className="piano-hint-sep">·</span>
        <span>QWERTY: <code>zxcvbnm</code> / <code>qwerty</code></span>
        <span className="piano-hint-sep">·</span>
        <span>Octave: <code>[</code> <code>]</code> ({octaveShift > 0 ? `+${octaveShift}` : octaveShift})</span>
      </div>
      <div className="piano-scroll" ref={scrollerRef}>
        <div className="piano-keys" style={{ width: totalWidth }}>
          {whiteKeys.map((k, i) => {
            const isCenter = k.midi === centerMidi || (k.midi <= centerMidi && (whiteKeys[i + 1]?.midi ?? Infinity) > centerMidi);
            return (
              <div
                key={k.midi}
                ref={isCenter ? centerKeyRef : null}
                className={`pkey white ${keyState(k.midi)}`}
                style={{ width: whiteKeyWidth }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  trigger(k.midi);
                }}
              >
                <span className={`pkey-label ${labelMode === 'solfege' ? 'solfege' : ''}`}>
                  {labelMode === 'solfege' ? solfege(k.midi) : noteName(k.midi)}
                </span>
              </div>
            );
          })}
          {blackKeys.map((k) => {
            const whiteIndexBelow = whiteKeys.findIndex((w) => w.midi === k.midi - 1);
            const left = (whiteIndexBelow + 1) * whiteKeyWidth - blackKeyWidth / 2;
            return (
              <div
                key={k.midi}
                className={`pkey black ${keyState(k.midi)}`}
                style={{ left, width: blackKeyWidth }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  trigger(k.midi);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
