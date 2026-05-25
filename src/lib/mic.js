import { detectPitch } from './pitchDetect.js';
import { ensureAudio, getAudioContext } from './audio.js';

export function isMicAvailable() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

export async function startMic({ onSample }) {
  if (!isMicAvailable()) {
    throw new Error('Microphone not available in this browser');
  }
  ensureAudio();
  const ctx = getAudioContext();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let stopped = false;
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);

    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);

    let result = { freq: null, clarity: 0 };
    if (rms > 0.008) {
      result = detectPitch(buffer, ctx.sampleRate);
    }

    onSample({ freq: result.freq, clarity: result.clarity, rms });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    try {
      source.disconnect();
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
  };
}
