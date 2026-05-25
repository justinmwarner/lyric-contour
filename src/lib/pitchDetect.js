// YIN pitch detection algorithm.
// Reference: de Cheveigné & Kawahara (2002), "YIN, a fundamental frequency
// estimator for speech and music."
//
// Returns { freq: number | null, clarity: number in [0, 1] }.
// freq is null when no clear pitch was found.

const THRESHOLD = 0.15;

export function detectPitch(buffer, sampleRate) {
  const size = buffer.length;
  const tauMax = Math.floor(size / 2);

  // Step 1: Difference function.
  const d = new Float32Array(tauMax);
  for (let tau = 1; tau < tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < tauMax; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Step 2: Cumulative mean normalized difference.
  const dPrime = new Float32Array(tauMax);
  dPrime[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < tauMax; tau++) {
    runningSum += d[tau];
    dPrime[tau] = (d[tau] * tau) / runningSum;
  }

  // Step 3: Absolute threshold — first τ below threshold that is a local min.
  let tauEstimate = -1;
  for (let tau = 2; tau < tauMax; tau++) {
    if (dPrime[tau] < THRESHOLD) {
      while (tau + 1 < tauMax && dPrime[tau + 1] < dPrime[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    return { freq: null, clarity: 0 };
  }

  // Step 4: Parabolic interpolation for sub-sample accuracy.
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < tauMax - 1) {
    const s0 = dPrime[tauEstimate - 1];
    const s1 = dPrime[tauEstimate];
    const s2 = dPrime[tauEstimate + 1];
    const denom = 2 * (s0 - 2 * s1 + s2);
    if (denom !== 0) {
      const adjustment = (s0 - s2) / denom;
      if (Number.isFinite(adjustment) && Math.abs(adjustment) < 1) {
        betterTau = tauEstimate + adjustment;
      }
    }
  }

  const freq = sampleRate / betterTau;
  const clarity = Math.max(0, Math.min(1, 1 - dPrime[tauEstimate]));
  return { freq, clarity };
}
