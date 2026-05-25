import { useEffect, useRef, useState } from 'react';
import { noteName } from '../lib/notes.js';

const FREEFORM_MIN_SAMPLES = 240;
const FREEFORM_MIN_SPAN = 12;

export default function RangeFinder({ isOpen, onClose, onSave, currentMicMidi }) {
  const [mode, setMode] = useState('freeform');

  const [step, setStep] = useState('low');
  const [capturedLow, setCapturedLow] = useState(null);
  const [capturedHigh, setCapturedHigh] = useState(null);
  const [error, setError] = useState(null);
  const recentRef = useRef([]);

  const freeformSamplesRef = useRef([]);
  const [freeformStats, setFreeformStats] = useState({
    count: 0,
    low: null,
    high: null,
  });
  const [freeformCaptured, setFreeformCaptured] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep('low');
    setCapturedLow(null);
    setCapturedHigh(null);
    setError(null);
    recentRef.current = [];
    freeformSamplesRef.current = [];
    setFreeformStats({ count: 0, low: null, high: null });
    setFreeformCaptured(null);
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen || mode !== 'step' || currentMicMidi == null) return;
    recentRef.current.push(currentMicMidi);
    if (recentRef.current.length > 60) recentRef.current.shift();
  }, [currentMicMidi, isOpen, mode]);

  useEffect(() => {
    if (
      !isOpen ||
      mode !== 'freeform' ||
      currentMicMidi == null ||
      freeformCaptured
    )
      return;
    freeformSamplesRef.current.push(currentMicMidi);
    setFreeformStats((prev) => ({
      count: freeformSamplesRef.current.length,
      low:
        prev.low == null ? currentMicMidi : Math.min(prev.low, currentMicMidi),
      high:
        prev.high == null
          ? currentMicMidi
          : Math.max(prev.high, currentMicMidi),
    }));
  }, [currentMicMidi, isOpen, mode, freeformCaptured]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const livePitchText =
    currentMicMidi != null ? noteName(Math.round(currentMicMidi)) : '—';

  // step-by-step handlers
  const stepCapture = () => {
    const buf = recentRef.current;
    if (buf.length < 5) {
      setError('Sing for a moment, then try Capture');
      return;
    }
    const sorted = [...buf].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const rounded = Math.round(median);
    if (step === 'low') {
      setCapturedLow(rounded);
      setStep('high');
      recentRef.current = [];
      setError(null);
    } else if (step === 'high') {
      if (rounded <= capturedLow) {
        setError(
          'High note should be above the low note. Sing higher and try again.',
        );
        return;
      }
      setCapturedHigh(rounded);
      setStep('done');
      setError(null);
    }
  };

  const stepReset = () => {
    setStep('low');
    setCapturedLow(null);
    setCapturedHigh(null);
    setError(null);
    recentRef.current = [];
  };

  const stepSave = () => {
    if (capturedLow != null && capturedHigh != null) {
      onSave?.({ low: capturedLow, high: capturedHigh });
    }
  };

  const stepHasEnough = recentRef.current.length >= 8;

  // free-form handlers
  const freeformSpan =
    freeformStats.low != null && freeformStats.high != null
      ? freeformStats.high - freeformStats.low
      : 0;
  const canFinishFreeform =
    freeformStats.count >= FREEFORM_MIN_SAMPLES &&
    freeformSpan >= FREEFORM_MIN_SPAN;

  const freeformFinish = () => {
    if (!canFinishFreeform) return;
    const samples = [...freeformSamplesRef.current].sort((a, b) => a - b);
    const lowIdx = Math.max(0, Math.floor(samples.length * 0.03));
    const highIdx = Math.min(
      samples.length - 1,
      Math.floor(samples.length * 0.97),
    );
    setFreeformCaptured({
      low: Math.round(samples[lowIdx]),
      high: Math.round(samples[highIdx]),
    });
  };

  const freeformReset = () => {
    freeformSamplesRef.current = [];
    setFreeformStats({ count: 0, low: null, high: null });
    setFreeformCaptured(null);
  };

  const freeformSave = () => {
    if (freeformCaptured) onSave?.(freeformCaptured);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal range-finder-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Find your vocal range"
      >
        <div className="modal-header">
          <h2 className="range-title">Find your vocal range</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="range-mode-tabs">
          <button
            className={`pill ${mode === 'freeform' ? 'on' : ''}`}
            onClick={() => setMode('freeform')}
          >
            Sing your range
          </button>
          <button
            className={`pill ${mode === 'step' ? 'on' : ''}`}
            onClick={() => setMode('step')}
          >
            Step by step
          </button>
        </div>

        <div className="modal-body range-body">
          {mode === 'freeform' ? (
            freeformCaptured ? (
              <>
                <p className="range-prompt">Got it. Your vocal range:</p>
                <div className="range-summary">
                  <strong>
                    {noteName(freeformCaptured.low)} –{' '}
                    {noteName(freeformCaptured.high)}
                  </strong>
                  <span className="range-summary-sub">
                    {freeformCaptured.high - freeformCaptured.low} semitones
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="range-prompt">
                  <strong>Sing through your range</strong> — slide slowly from
                  your lowest comfortable note up to your highest (or vice
                  versa). Take your time and hold the extremes for a moment.
                </p>
                <div className="range-live">
                  <div className="range-live-label">Hearing</div>
                  <div className="range-live-pitch">{livePitchText}</div>
                </div>
                <div className="range-freeform-stats">
                  <div className="range-freeform-caught">
                    Caught so far:{' '}
                    <strong>
                      {freeformStats.low != null
                        ? `${noteName(Math.round(freeformStats.low))} – ${noteName(Math.round(freeformStats.high))}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="range-progress-row">
                    <span>Span</span>
                    <span>
                      {freeformSpan.toFixed(0)} / {FREEFORM_MIN_SPAN} semitones
                    </span>
                  </div>
                  <div className="range-progress-bar">
                    <div
                      className="range-progress-fill"
                      style={{
                        width: `${Math.min(100, (freeformSpan / FREEFORM_MIN_SPAN) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="range-progress-row">
                    <span>Samples</span>
                    <span>
                      {freeformStats.count} / {FREEFORM_MIN_SAMPLES}
                    </span>
                  </div>
                  <div className="range-progress-bar">
                    <div
                      className="range-progress-fill"
                      style={{
                        width: `${Math.min(100, (freeformStats.count / FREEFORM_MIN_SAMPLES) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            )
          ) : (
            <>
              {step === 'low' && (
                <>
                  <p className="range-prompt">
                    <strong>Step 1 of 2.</strong> Sing your{' '}
                    <em>lowest comfortable</em> note and hold it steady for a
                    second or two.
                  </p>
                  <div className="range-live">
                    <div className="range-live-label">Hearing</div>
                    <div className="range-live-pitch">{livePitchText}</div>
                  </div>
                </>
              )}
              {step === 'high' && (
                <>
                  <p className="range-prompt">
                    <strong>Step 2 of 2.</strong> Now sing your{' '}
                    <em>highest comfortable</em> note.
                  </p>
                  <div className="range-captured">
                    Low captured: <strong>{noteName(capturedLow)}</strong>
                  </div>
                  <div className="range-live">
                    <div className="range-live-label">Hearing</div>
                    <div className="range-live-pitch">{livePitchText}</div>
                  </div>
                </>
              )}
              {step === 'done' && (
                <>
                  <p className="range-prompt">Got it. Your vocal range:</p>
                  <div className="range-summary">
                    <strong>
                      {noteName(capturedLow)} – {noteName(capturedHigh)}
                    </strong>
                    <span className="range-summary-sub">
                      {capturedHigh - capturedLow} semitones
                    </span>
                  </div>
                </>
              )}
            </>
          )}
          {error && <div className="range-error">{error}</div>}
        </div>

        <div className="modal-footer range-footer">
          {mode === 'freeform' ? (
            freeformCaptured ? (
              <>
                <button className="ghost" onClick={freeformReset}>
                  Try again
                </button>
                <button className="primary" onClick={freeformSave}>
                  Save range
                </button>
              </>
            ) : (
              <>
                <button className="ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={freeformFinish}
                  disabled={!canFinishFreeform}
                >
                  {canFinishFreeform ? "I'm done" : 'Keep singing…'}
                </button>
              </>
            )
          ) : step !== 'done' ? (
            <>
              <button className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={stepCapture}
                disabled={!stepHasEnough}
              >
                Capture
              </button>
            </>
          ) : (
            <>
              <button className="ghost" onClick={stepReset}>
                Try again
              </button>
              <button className="primary" onClick={stepSave}>
                Save range
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
