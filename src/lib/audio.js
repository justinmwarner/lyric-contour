import { frequency } from './notes.js';

let ctx = null;
const active = new Set();

const VOICES = {
  piano: {
    oscillators: [
      { type: 'triangle', detune: -4 },
      { type: 'triangle', detune: 4 },
    ],
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.35, release: 0.18, peak: 0.55 },
  },
  sine: {
    oscillators: [{ type: 'sine', detune: 0 }],
    envelope: { attack: 0.02, decay: 0.04, sustain: 0.45, release: 0.12, peak: 0.5 },
  },
  strings: {
    oscillators: [
      { type: 'sawtooth', detune: -8 },
      { type: 'sawtooth', detune: 8 },
    ],
    envelope: { attack: 0.08, decay: 0.06, sustain: 0.42, release: 0.35, peak: 0.36 },
    filter: { type: 'lowpass', frequency: 1900, Q: 0.9 },
  },
};

let currentVoice = 'piano';

export function setVoice(v) {
  if (VOICES[v]) currentVoice = v;
}

export const VOICE_NAMES = Object.keys(VOICES);

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function ensureAudio() {
  getCtx();
}

export function getAudioContext() {
  return getCtx();
}

function scheduleNote(midi, when, durationSec, gainScale = 1) {
  const c = getCtx();
  const freq = frequency(midi);
  const voice = VOICES[currentVoice] || VOICES.piano;
  const { attack, decay, sustain: sustainLevel, release, peak } = voice.envelope;
  const sustain = sustainLevel * gainScale;
  const peakLevel = peak * gainScale;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakLevel), when + attack);
  if (decay > 0) {
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, sustain),
      when + attack + decay,
    );
  }
  gain.gain.setValueAtTime(
    Math.max(0.0001, sustain),
    when + Math.max(attack + decay, durationSec),
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    when + Math.max(attack + decay, durationSec) + release,
  );

  if (voice.filter) {
    const filter = c.createBiquadFilter();
    filter.type = voice.filter.type;
    filter.frequency.value = voice.filter.frequency;
    filter.Q.value = voice.filter.Q;
    gain.connect(filter);
    filter.connect(c.destination);
  } else {
    gain.connect(c.destination);
  }

  const stopAt = when + Math.max(attack + decay, durationSec) + release + 0.02;
  const oscs = [];
  for (const cfg of voice.oscillators) {
    const osc = c.createOscillator();
    osc.type = cfg.type;
    osc.frequency.value = freq * (cfg.freqMultiplier || 1);
    osc.detune.value = cfg.detune || 0;
    osc.connect(gain);
    osc.start(when);
    osc.stop(stopAt);
    oscs.push(osc);
  }

  const handle = { oscs, gain, stopAt };
  active.add(handle);
  if (oscs.length) {
    oscs[oscs.length - 1].onended = () => active.delete(handle);
  }
  return handle;
}

export function playNote(midi, durationSec = 0.6) {
  const c = getCtx();
  return scheduleNote(midi, c.currentTime, durationSec);
}

export function stopAll() {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  for (const h of active) {
    try {
      h.gain.gain.cancelScheduledValues(now);
      h.gain.gain.setValueAtTime(h.gain.gain.value, now);
      h.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      for (const osc of h.oscs) osc.stop(now + 0.06);
    } catch {}
  }
  active.clear();
}

export function playSequence(notes, beatSeconds, { onTick, onDone, getLoop } = {}) {
  stopAll();
  const c = getCtx();
  const startBeat = notes[0]?.start ?? 0;
  const last = notes[notes.length - 1];
  const endBeat = last ? last.start + last.duration : startBeat;
  const totalSec = (endBeat - startBeat) * beatSeconds;

  let cycleStart = c.currentTime + 0.05;
  let raf = 0;
  let cancelled = false;

  const scheduleCycle = (when) => {
    for (const n of notes) {
      const offset = (n.start - startBeat) * beatSeconds;
      const dur = n.duration * beatSeconds;
      scheduleNote(n.midi, when + offset, Math.max(0.08, dur * 0.95));
    }
  };

  scheduleCycle(cycleStart);

  const tick = () => {
    if (cancelled) return;
    const elapsed = c.currentTime - cycleStart;
    if (elapsed >= totalSec) {
      if (getLoop?.()) {
        cycleStart = c.currentTime + 0.05;
        scheduleCycle(cycleStart);
        onTick?.(startBeat);
        raf = requestAnimationFrame(tick);
        return;
      }
      onTick?.(endBeat);
      onDone?.();
      return;
    }
    onTick?.(Math.max(startBeat, startBeat + elapsed / beatSeconds));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    stopAll();
  };
}

export function beatSecondsFromBpm(bpm) {
  const cleaned = typeof bpm === 'string' ? bpm.replace(',', '.') : bpm;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 60 / (120 * 4);
  return 60 / (n * 4);
}
