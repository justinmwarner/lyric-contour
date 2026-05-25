import { useState, useMemo, useEffect, useRef } from 'react';
import { parse } from '../lib/parser.js';
import {
  loadSongList,
  saveSongList,
  loadSong,
  saveSong,
  deleteSong,
  slugify,
} from '../lib/storage.js';
import { midiOf, noteName, solfege, isBlackKey, freqToMidi } from '../lib/notes.js';
import { startMic, isMicAvailable } from '../lib/mic.js';
import { createOctaveCalibrator } from '../lib/octaveCalibrator.js';
import {
  ensureAudio,
  playNote,
  playSequence,
  stopAll,
  beatSecondsFromBpm,
  setVoice,
} from '../lib/audio.js';
import { SAMPLE } from '../sample.js';
import { usePersistedState } from '../lib/usePersistedState.js';
import Phrase, {
  PHRASE_PAD_TOP,
  PHRASE_PAD_BOTTOM,
  PHRASE_HEADER_HEIGHT,
} from './Phrase.jsx';
import Piano from './Piano.jsx';
import SearchDialog from './SearchDialog.jsx';
import RangeFinder from './RangeFinder.jsx';

function AxisStrip({ pitchMin, pitchMax, transpose, labelMode, height }) {
  const pitchRange = Math.max(1, pitchMax - pitchMin);
  const labels = [];
  const startP = Math.ceil(pitchMin);
  const endP = Math.floor(pitchMax);
  for (let p = startP; p <= endP; p++) {
    const midi = midiOf(p, transpose);
    if (isBlackKey(midi)) continue;
    const y =
      PHRASE_PAD_TOP +
      (1 - (p - pitchMin) / pitchRange) *
        (height - PHRASE_PAD_TOP - PHRASE_PAD_BOTTOM);
    labels.push({
      y,
      text: labelMode === 'solfege' ? solfege(midi) : noteName(midi),
    });
  }
  const width = 52;
  return (
    <div className="score-axis">
      <div
        className="axis-spacer"
        style={{ height: PHRASE_HEADER_HEIGHT }}
      />
      <svg width={width} height={height} className="axis-strip">
        {labels.map((l, i) => (
          <text
            key={i}
            x={width - 6}
            y={l.y}
            textAnchor="end"
            dominantBaseline="middle"
            className="axis-label"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

const PIANO_LOW = 36;
const PIANO_HIGH = 96;

export default function LyricContour() {
  const [input, setInput] = useState(SAMPLE);
  const [showInput, setShowInput] = useState(false);
  const [library, setLibrary] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [labelMode, setLabelMode] = usePersistedState('lc-labels', 'letters');
  const [transpose, setTranspose] = usePersistedState('lc-transpose', 0);
  const [viewMode, setViewMode] = usePersistedState('lc-view', 'wrap');
  const [speed, setSpeed] = usePersistedState('lc-speed', 1);
  const [zoom, setZoom] = usePersistedState('lc-zoom', 1);
  const [voice, setVoiceState] = usePersistedState('lc-voice', 'piano');
  const [micOn, setMicOn] = usePersistedState('lc-mic', false);
  const [vocalRange, setVocalRange] = usePersistedState('lc-vocal-range', null);
  const [rangeFinderOpen, setRangeFinderOpen] = useState(false);
  const [micError, setMicError] = useState(null);
  const [traceVersion, setTraceVersion] = useState(0);
  useEffect(() => {
    setVoice(voice);
  }, [voice]);
  const [hoveredMidi, setHoveredMidi] = useState(null);
  const [playheadBeat, setPlayheadBeat] = useState(null);
  const [playingFromIndex, setPlayingFromIndex] = useState(null);
  const [loopRange, setLoopRange] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const stopRef = useRef(null);
  const scoreRef = useRef(null);
  const phraseRefs = useRef([]);
  const overlayRef = useRef(null);
  const lastScrolledPhraseRef = useRef(null);
  const lastEndlessScrollRef = useRef(-1);
  const micStopRef = useRef(null);
  const micSamplesRef = useRef([]);
  const currentMicMidiRef = useRef(null);
  const lastVoicedAtRef = useRef(0);
  const calibratorRef = useRef(null);
  const calibrationBypassRef = useRef(false);
  const smoothBufferRef = useRef([]);
  const playheadBeatRef = useRef(null);
  const MIC_HOLD_MS = 500;
  const MIC_CLARITY = 0.7;
  const MIC_RMS = 0.006;
  const SMOOTH_SIZE = 5;
  const PIXELS_PER_BEAT = 14;

  useEffect(() => {
    playheadBeatRef.current = playheadBeat;
  }, [playheadBeat]);

  useEffect(() => {
    const list = loadSongList();
    setLibrary(list);
    if (list.length > 0) {
      const last = list[0];
      const data = loadSong(last.id);
      if (data) {
        setInput(data.text);
        setCurrentId(last.id);
      }
    }
    setLoaded(true);
  }, []);

  const parsed = useMemo(() => {
    try {
      const { metadata, phrases } = parse(input);
      const allPitches = phrases.flatMap((p) => p.notes.map((n) => n.pitch));
      if (allPitches.length === 0) {
        return {
          metadata,
          phrases,
          songPitchMin: 0,
          songPitchMax: 0,
          isDuet: false,
          error: 'No notes found. Paste UltraStar .txt or AllKaraoke JSON.',
        };
      }
      const singers = new Set(
        phrases.map((p) => p.singer).filter((s) => s === 1 || s === 2),
      );
      return {
        metadata,
        phrases,
        songPitchMin: Math.min(...allPitches),
        songPitchMax: Math.max(...allPitches),
        isDuet: singers.size >= 2,
        error: null,
      };
    } catch (e) {
      return {
        metadata: {},
        phrases: [],
        songPitchMin: 0,
        songPitchMax: 0,
        isDuet: false,
        error: String(e),
      };
    }
  }, [input]);

  const { metadata, phrases, songPitchMin, songPitchMax, isDuet, error } = parsed;

  const baseRange = useMemo(() => {
    let min = songPitchMin;
    let max = songPitchMax;
    if (vocalRange && phrases.length > 0) {
      const userLowPitch = vocalRange.low - 60 - transpose;
      const userHighPitch = vocalRange.high - 60 - transpose;
      min = Math.min(min, userLowPitch);
      max = Math.max(max, userHighPitch);
    }
    return { min, max };
  }, [songPitchMin, songPitchMax, vocalRange, transpose, phrases.length]);

  const { pitchMin, pitchMax } = useMemo(() => {
    const center = (baseRange.min + baseRange.max) / 2;
    const halfRange = Math.max(0.5, (baseRange.max - baseRange.min) / 2);
    const adjustedHalfRange = halfRange / zoom;
    return {
      pitchMin: center - adjustedHalfRange,
      pitchMax: center + adjustedHalfRange,
    };
  }, [baseRange, zoom]);

  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (!micOn) {
      micStopRef.current?.();
      micStopRef.current = null;
      calibratorRef.current = null;
      currentMicMidiRef.current = null;
      lastVoicedAtRef.current = 0;
      return;
    }
    let cancelled = false;
    setMicError(null);
    calibratorRef.current = createOctaveCalibrator({ rangeHint: vocalRange });
    smoothBufferRef.current = [];
    startMic({
      onSample: ({ freq, clarity, rms }) => {
        const now = performance.now();
        let correctedMidi = null;
        if (freq != null && clarity > MIC_CLARITY && rms > MIC_RMS) {
          const raw = freqToMidi(freq);
          if (raw != null) {
            correctedMidi = calibrationBypassRef.current
              ? raw
              : calibratorRef.current?.correct(raw) ?? raw;
          }
        }
        if (correctedMidi != null) {
          const buf = smoothBufferRef.current;
          buf.push(correctedMidi);
          if (buf.length > SMOOTH_SIZE) buf.shift();
          const sorted = [...buf].sort((a, b) => a - b);
          currentMicMidiRef.current = sorted[Math.floor(sorted.length / 2)];
          lastVoicedAtRef.current = now;
        } else if (now - lastVoicedAtRef.current > MIC_HOLD_MS) {
          currentMicMidiRef.current = null;
          smoothBufferRef.current = [];
        }
        const beat = playheadBeatRef.current;
        if (beat != null) {
          micSamplesRef.current.push({
            beat,
            midi: correctedMidi,
            voiced: correctedMidi != null,
          });
        }
        setTraceVersion((v) => (v + 1) & 0xffff);
      },
    })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        micStopRef.current = stop;
      })
      .catch((err) => {
        if (cancelled) return;
        setMicError(String(err.message || err));
        setMicOn(false);
      });
    return () => {
      cancelled = true;
      micStopRef.current?.();
      micStopRef.current = null;
    };
  }, [micOn, vocalRange]);

  useEffect(() => {
    calibrationBypassRef.current = rangeFinderOpen;
    if (rangeFinderOpen && !micOn) setMicOn(true);
  }, [rangeFinderOpen, micOn, setMicOn]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (playheadBeat == null) {
      overlay.style.opacity = '0';
      lastScrolledPhraseRef.current = null;
      lastEndlessScrollRef.current = -1;
      return;
    }
    let hostIndex = -1;
    for (let i = 0; i < phrases.length; i++) {
      const ns = phrases[i].notes;
      if (!ns.length) continue;
      if (ns[0].start <= playheadBeat) {
        hostIndex = i;
      } else {
        break;
      }
    }
    if (hostIndex < 0) {
      overlay.style.opacity = '0';
      return;
    }
    const el = phraseRefs.current[hostIndex];
    if (!el) return;
    const phrase = phrases[hostIndex];
    const start = phrase.notes[0].start;
    const last = phrase.notes[phrase.notes.length - 1];
    const end = last.start + last.duration;
    const beatSpan = Math.max(0, end - start);
    const beatOffset = Math.min(beatSpan, Math.max(0, playheadBeat - start));
    const x = el.offsetLeft + beatOffset * PIXELS_PER_BEAT;

    overlay.style.opacity = '1';
    overlay.style.transform = `translate(${x}px, ${el.offsetTop}px)`;
    overlay.style.height = `${el.offsetHeight}px`;

    if (viewMode === 'endless') {
      const scroller = scoreRef.current;
      if (scroller) {
        const sr = scroller.getBoundingClientRect();
        const visibleLeft = scroller.scrollLeft;
        const visibleRight = visibleLeft + sr.width;
        const triggerRight = visibleRight - sr.width * 0.18;
        let nextTarget = null;
        if (x > triggerRight) {
          nextTarget = Math.max(0, x - sr.width * 0.22);
        } else if (x < visibleLeft + 20) {
          nextTarget = Math.max(0, x - sr.width * 0.22);
        }
        if (
          nextTarget != null &&
          Math.abs(nextTarget - lastEndlessScrollRef.current) > 80
        ) {
          scroller.scrollLeft = nextTarget;
          lastEndlessScrollRef.current = nextTarget;
        }
      }
    } else if (hostIndex !== lastScrolledPhraseRef.current) {
      const rect = el.getBoundingClientRect();
      const targetTop = window.innerHeight * 0.25;
      const delta = rect.top - targetTop;
      if (Math.abs(delta) > 24) {
        window.scrollBy({ top: delta, behavior: 'smooth' });
      }
      lastScrolledPhraseRef.current = hostIndex;
    }
  }, [playheadBeat, viewMode, phrases]);

  const handleSave = () => {
    const title = metadata.TITLE || 'Untitled';
    const artist = metadata.ARTIST || '';
    const id = currentId || `${slugify(title)}-${Date.now().toString(36)}`;
    saveSong(id, { text: input, title, artist });

    const existingIndex = library.findIndex((s) => s.id === id);
    let newList;
    if (existingIndex >= 0) {
      newList = [library[existingIndex], ...library.filter((s) => s.id !== id)];
      newList[0] = { id, title, artist };
    } else {
      newList = [{ id, title, artist }, ...library];
    }
    setLibrary(newList);
    setCurrentId(id);
    saveSongList(newList);
    setShowInput(false);
  };

  const handleOpen = (id) => {
    const data = loadSong(id);
    if (!data) return;
    setInput(data.text);
    setCurrentId(id);
    setShowInput(false);
    const newList = [
      library.find((s) => s.id === id),
      ...library.filter((s) => s.id !== id),
    ].filter(Boolean);
    setLibrary(newList);
    saveSongList(newList);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    deleteSong(id);
    const newList = library.filter((s) => s.id !== id);
    setLibrary(newList);
    saveSongList(newList);
    if (currentId === id) {
      setCurrentId(null);
      setInput(SAMPLE);
    }
  };

  const handleNew = () => {
    setInput('');
    setCurrentId(null);
    setShowInput(true);
  };

  const handleImport = ({ id, title, artist, text }) => {
    const localId = `ak-${id}`;
    saveSong(localId, { text, title, artist });
    const newList = [
      { id: localId, title, artist },
      ...library.filter((s) => s.id !== localId),
    ];
    setLibrary(newList);
    saveSongList(newList);
    setCurrentId(localId);
    setInput(text);
    setShowInput(false);
    setSearchOpen(false);
  };

  const handlePlayNote = (midi) => {
    ensureAudio();
    playNote(midi, 0.7);
  };

  const playNotes = (notes, { fromIndex = null, shouldLoop = false } = {}) => {
    if (!notes.length) return;
    ensureAudio();
    stopRef.current?.();
    const beatSec = beatSecondsFromBpm(metadata.BPM) / speed;
    const withMidi = notes.map((n) => ({ ...n, midi: midiOf(n.pitch, transpose) }));
    setPlayheadBeat(withMidi[0].start);
    setPlayingFromIndex(fromIndex);
    micSamplesRef.current = [];
    setTraceVersion((v) => (v + 1) & 0xffff);
    stopRef.current = playSequence(withMidi, beatSec, {
      onTick: (b) => setPlayheadBeat(b),
      onDone: () => {
        setPlayheadBeat(null);
        setPlayingFromIndex(null);
      },
      getLoop: () => shouldLoop,
    });
  };

  const handlePlayPhrase = (notes) => {
    if (playingFromIndex !== null || loopRange) return;
    playNotes(notes);
  };

  const handleRowButton = (index) => {
    if (loopRange) {
      handleStop();
      return;
    }
    if (playingFromIndex !== null) {
      if (index === playingFromIndex) {
        handleStop();
        return;
      }
      const start = Math.min(playingFromIndex, index);
      const end = Math.max(playingFromIndex, index);
      const flat = [];
      for (let r = start; r <= end; r++) {
        for (const n of phrases[r].notes) flat.push(n);
      }
      setLoopRange({ start, end });
      playNotes(flat, { fromIndex: playingFromIndex, shouldLoop: true });
      return;
    }
    const flat = [];
    for (let r = index; r < phrases.length; r++) {
      for (const n of phrases[r].notes) flat.push(n);
    }
    playNotes(flat, { fromIndex: index });
  };

  const handleStop = () => {
    stopRef.current?.();
    stopRef.current = null;
    stopAll();
    setPlayheadBeat(null);
    setPlayingFromIndex(null);
    setLoopRange(null);
  };

  const applyAutoTranspose = (range) => {
    if (!range || phrases.length === 0) return;
    const songLowMidi = midiOf(songPitchMin, 0);
    const songHighMidi = midiOf(songPitchMax, 0);
    const songCenter = (songLowMidi + songHighMidi) / 2;
    const userCenter = (range.low + range.high) / 2;
    setTranspose(Math.round(userCenter - songCenter));
  };

  const handleAutoTranspose = () => applyAutoTranspose(vocalRange);

  const titleParts = metadata.TITLE ? metadata.TITLE.split(' ') : ['Paste', 'a', 'song'];
  const lastWord = titleParts[titleParts.length - 1];
  const leadWords = titleParts.slice(0, -1).join(' ');

  const hasNotes = phrases.length > 0 && !error;
  const lowMidi = hasNotes ? midiOf(pitchMin, transpose) : null;
  const highMidi = hasNotes ? midiOf(pitchMax, transpose) : null;
  const medianMidi = hasNotes
    ? midiOf(Math.round((pitchMin + pitchMax) / 2), transpose)
    : 60;

  const playingMidis = useMemo(() => {
    if (playheadBeat == null) return null;
    const set = new Set();
    for (const phrase of phrases) {
      for (const note of phrase.notes) {
        const end = note.start + note.duration;
        if (playheadBeat >= note.start && playheadBeat <= end) {
          set.add(midiOf(note.pitch, transpose));
        }
      }
    }
    return set.size > 0 ? set : null;
  }, [playheadBeat, phrases, transpose]);

  return (
    <div className="page">
      <div className="container">
        <header className="masthead">
          <div className="brand">
            <span className="brand-mark">◆</span> Lyric Contour
          </div>
          <div className="meta-line">A singer's view of the shape of a song</div>
        </header>

        {loaded && library.length > 0 && (
          <div className="library">
            <span className="lib-label">Library</span>
            {library.map((song) => (
              <span
                key={song.id}
                className={`song-chip ${song.id === currentId ? 'active' : ''}`}
                onClick={() => handleOpen(song.id)}
              >
                <span>{song.title || 'Untitled'}</span>
                <span
                  className="x"
                  onClick={(e) => handleDelete(song.id, e)}
                  title="Remove"
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="title-block">
          <h1>
            {leadWords} <em>{lastWord}</em>
          </h1>
          {metadata.ARTIST && <div className="artist">{metadata.ARTIST}</div>}
          {hasNotes && (
            <div className="song-meta">
              <span>
                Range <strong>{noteName(lowMidi)}–{noteName(highMidi)}</strong>
              </span>
              {metadata.BPM && (
                <span>
                  BPM <strong>{metadata.BPM}</strong>
                </span>
              )}
              {isDuet && (
                <span className="duet-tag">
                  Duet
                </span>
              )}
            </div>
          )}
        </div>

        <div className="toolbar">
          <button className="primary" onClick={() => setSearchOpen(true)}>
            Find Song
          </button>
          <button onClick={handleNew}>+ Paste</button>
          {showInput || !currentId ? null : (
            <button onClick={() => setShowInput(true)}>Edit Source</button>
          )}
          <button className="ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
          <button
            className={vocalRange ? 'ghost' : ''}
            onClick={() => setRangeFinderOpen(true)}
            title={
              vocalRange
                ? `Your range: ${noteName(vocalRange.low)}–${noteName(vocalRange.high)}. Click to redo.`
                : 'Sing two notes to capture your vocal range'
            }
          >
            {vocalRange
              ? `Range ${noteName(vocalRange.low)}–${noteName(vocalRange.high)}`
              : 'Find my range'}
          </button>

          <div className="toolbar-group" role="group" aria-label="Labels">
            <span className="toolbar-label">Labels</span>
            <button
              className={`pill ${labelMode === 'letters' ? 'on' : ''}`}
              onClick={() => setLabelMode('letters')}
            >
              C D E
            </button>
            <button
              className={`pill ${labelMode === 'solfege' ? 'on' : ''}`}
              onClick={() => setLabelMode('solfege')}
            >
              do re mi
            </button>
          </div>

          <div className="toolbar-group" role="group" aria-label="View">
            <span className="toolbar-label">View</span>
            <button
              className={`pill ${viewMode === 'wrap' ? 'on' : ''}`}
              onClick={() => setViewMode('wrap')}
              title="Multi-row, phrases wrap to container width"
            >
              Wrap
            </button>
            <button
              className={`pill ${viewMode === 'endless' ? 'on' : ''}`}
              onClick={() => setViewMode('endless')}
              title="Single horizontal strip, scroll left/right"
            >
              Endless
            </button>
          </div>

          <div className="toolbar-group" role="group" aria-label="Speed">
            <span className="toolbar-label">Speed</span>
            {[
              [0.5, '½×'],
              [0.75, '¾×'],
              [1, '1×'],
            ].map(([v, label]) => (
              <button
                key={v}
                className={`pill ${speed === v ? 'on' : ''}`}
                onClick={() => setSpeed(v)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="toolbar-group" role="group" aria-label="Height">
            <span className="toolbar-label">Height</span>
            <button
              className="pill"
              onClick={() =>
                setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 4) / 4))
              }
              title="Make phrases shorter"
            >
              −
            </button>
            <span className="pill readonly">
              {zoom.toString().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}×
            </span>
            <button
              className="pill"
              onClick={() =>
                setZoom((z) => Math.min(3, Math.round((z + 0.25) * 4) / 4))
              }
              title="Make phrases taller"
            >
              +
            </button>
            {zoom !== 1 && (
              <button className="pill ghost-pill" onClick={() => setZoom(1)}>
                reset
              </button>
            )}
          </div>

          <div className="toolbar-group" role="group" aria-label="Transpose">
            <span className="toolbar-label">Transpose</span>
            <button className="pill" onClick={() => setTranspose((t) => t - 1)}>−</button>
            <span className="pill readonly">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button className="pill" onClick={() => setTranspose((t) => t + 1)}>+</button>
            {vocalRange && hasNotes && (
              <button
                className="pill"
                onClick={handleAutoTranspose}
                title="Center this song in your vocal range"
              >
                Auto
              </button>
            )}
            {transpose !== 0 && (
              <button className="pill ghost-pill" onClick={() => setTranspose(0)}>
                reset
              </button>
            )}
          </div>

          {isMicAvailable() && (
            <button
              className={`pill mic-toggle ${micOn ? 'on' : ''}`}
              onClick={() => setMicOn((v) => !v)}
              title={micOn ? 'Mic on (click to stop)' : 'Turn mic on for live pitch trace'}
            >
              <span className={`mic-dot ${micOn ? 'on' : ''}`} />
              Mic {micOn ? 'on' : 'off'}
            </button>
          )}
          {micError && (
            <span className="mic-error" title={micError}>
              Mic error
            </span>
          )}
          {loopRange && (
            <span className="loop-badge" title="Currently looping — click ■ Stop to end">
              ↻{' '}
              {loopRange.start === loopRange.end
                ? `Phrase ${loopRange.start + 1}`
                : `Phrases ${loopRange.start + 1}–${loopRange.end + 1}`}
            </span>
          )}
          {playheadBeat != null && (
            <button className="ghost" onClick={handleStop}>
              ■ Stop
            </button>
          )}
          <button className="primary" onClick={() => window.print()}>
            Print
          </button>
        </div>

        {showInput && (
          <div className="input-panel">
            <label>UltraStar .txt or AllKaraoke JSON</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={`#TITLE:Song Name\n#ARTIST:Artist\n: 0 4 60 First\n: 4 4 62 syl\n: 8 4 64 la\n: 12 4 65 ble\n- 16\n...\nE`}
            />
            <div className="input-actions">
              <button className="ghost" onClick={() => setShowInput(false)}>
                Cancel
              </button>
              <button className="primary" onClick={handleSave}>
                Save to Library
              </button>
            </div>
            <div className="hint">
              In AllKaraoke's editor, step through to the lyrics/notes step and look for
              the raw <code>:</code>-prefixed note lines. Paste the whole song including{' '}
              <code>#TITLE</code>, <code>#ARTIST</code>, and the note data. Once saved,
              it stays in the library across sessions.
            </div>
          </div>
        )}

        {error ? (
          <div className="error">{error}</div>
        ) : (
          (() => {
            const fullSemitoneSpan = Math.max(1, baseRange.max - baseRange.min);
            const naturalCount = Math.max(
              2,
              Math.ceil(((fullSemitoneSpan + 1) * 7) / 12),
            );
            const phraseHeight = Math.min(
              360,
              Math.max(
                220,
                Math.round(
                  22 * (naturalCount - 1) + PHRASE_PAD_TOP + PHRASE_PAD_BOTTOM,
                ),
              ),
            );
            void traceVersion;
            return (
              <div ref={scoreRef} className={`score view-${viewMode}`}>
                <AxisStrip
                  pitchMin={pitchMin}
                  pitchMax={pitchMax}
                  transpose={transpose}
                  labelMode={labelMode}
                  height={phraseHeight}
                />
                <div className="phrase-flow">
                  {phrases.map((phrase, i) => {
                    const buttonMode = loopRange
                      ? 'stop'
                      : playingFromIndex === null
                      ? 'play'
                      : i === playingFromIndex
                      ? 'stop'
                      : 'loop';
                    const buttonTitle =
                      buttonMode === 'play'
                        ? 'Play from here to the end'
                        : buttonMode === 'stop'
                        ? 'Stop'
                        : `Loop phrases ${
                            Math.min(playingFromIndex, i) + 1
                          }–${Math.max(playingFromIndex, i) + 1}`;
                    const loopState =
                      !loopRange || i < loopRange.start || i > loopRange.end
                        ? 'none'
                        : loopRange.start === loopRange.end
                        ? 'single'
                        : i === loopRange.start
                        ? 'start'
                        : i === loopRange.end
                        ? 'end'
                        : 'middle';
                    return (
                      <Phrase
                        key={`p-${i}`}
                        notes={phrase.notes}
                        singer={isDuet ? phrase.singer : null}
                        pitchMin={pitchMin}
                        pitchMax={pitchMax}
                        height={phraseHeight}
                        index={i}
                        transpose={transpose}
                        pixelsPerBeat={PIXELS_PER_BEAT}
                        onHoverNote={setHoveredMidi}
                        onPlayNote={handlePlayNote}
                        onPlayPhrase={handlePlayPhrase}
                        onRowButton={handleRowButton}
                        buttonMode={buttonMode}
                        buttonTitle={buttonTitle}
                        loopState={loopState}
                        micSamples={micSamplesRef.current}
                        currentMicMidi={currentMicMidiRef.current}
                        vocalRange={vocalRange}
                        registerRef={(el) => {
                          phraseRefs.current[i] = el;
                        }}
                      />
                    );
                  })}
                  <div
                    ref={overlayRef}
                    className="playhead-overlay"
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })()
        )}
      </div>

      <Piano
        lowMidi={PIANO_LOW}
        highMidi={PIANO_HIGH}
        highlightMidi={hoveredMidi}
        centerMidi={medianMidi}
        labelMode={labelMode}
        voice={voice}
        onVoiceChange={setVoiceState}
        playingMidis={playingMidis}
        micMidi={currentMicMidiRef.current}
      />

      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handleImport}
      />

      <RangeFinder
        isOpen={rangeFinderOpen}
        onClose={() => setRangeFinderOpen(false)}
        onSave={(range) => {
          setVocalRange(range);
          setRangeFinderOpen(false);
          applyAutoTranspose(range);
        }}
        currentMicMidi={currentMicMidiRef.current}
      />
    </div>
  );
}
