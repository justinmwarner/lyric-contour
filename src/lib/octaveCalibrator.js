// Running-median octave calibrator.
//
// YIN can lock onto sub-harmonics or harmonics and report a pitch that's
// off by ±12 / ±24 semitones from the singer's true note. This calibrator
// tracks the median of recent samples and snaps incoming samples to the
// nearest octave of that median, suppressing single-frame octave errors
// while still tracking legitimate octave changes after ~1s of sustained
// singing in the new range.

export function createOctaveCalibrator({
  windowSize = 40,
  bootstrap = 8,
  rangeHint = null,
} = {}) {
  const recent = [];

  return {
    correct(rawMidi) {
      if (rawMidi == null || !Number.isFinite(rawMidi)) return null;

      if (rangeHint) {
        const { low, high } = rangeHint;
        const slack = 2;
        if (rawMidi >= low - slack && rawMidi <= high + slack) {
          return rawMidi;
        }
        let best = rawMidi;
        let bestPenalty = Math.max(0, low - rawMidi, rawMidi - high);
        for (const shift of [-24, -12, 12, 24]) {
          const candidate = rawMidi + shift;
          const penalty = Math.max(0, low - candidate, candidate - high);
          if (penalty < bestPenalty) {
            bestPenalty = penalty;
            best = candidate;
          }
        }
        return best;
      }

      if (recent.length < bootstrap) {
        recent.push(rawMidi);
        return rawMidi;
      }

      const sorted = [...recent].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      let best = rawMidi;
      let bestDist = Math.abs(rawMidi - median);
      for (const shift of [-24, -12, 12, 24]) {
        const candidate = rawMidi + shift;
        const dist = Math.abs(candidate - median);
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }

      recent.push(best);
      if (recent.length > windowSize) recent.shift();
      return best;
    },
    reset() {
      recent.length = 0;
    },
  };
}
