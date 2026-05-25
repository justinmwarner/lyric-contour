function parseUltrastar(text) {
  const lines = text.split(/\r?\n/);
  const metadata = {};
  const phrases = [];
  let current = [];
  let currentSinger = null;

  const commit = () => {
    if (current.length > 0) {
      phrases.push({ singer: currentSinger, notes: current });
      current = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    if (line.startsWith('#')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(1, idx).trim().toUpperCase();
        metadata[key] = line.slice(idx + 1).trim();
      }
      continue;
    }

    const pMatch = line.match(/^P\s*(\d+)\s*$/i);
    if (pMatch) {
      commit();
      const n = parseInt(pMatch[1], 10);
      currentSinger = n === 1 || n === 2 || n === 3 ? n : null;
      continue;
    }

    const noteMatch = line.match(/^([:*FRG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/);
    if (noteMatch) {
      const [, type, start, dur, pitch, syllable] = noteMatch;
      current.push({
        type,
        start: parseInt(start, 10),
        duration: parseInt(dur, 10),
        pitch: parseInt(pitch, 10),
        syllable: syllable || '',
      });
      continue;
    }

    if (line.startsWith('-')) {
      commit();
      continue;
    }

    if (line.trim() === 'E') break;
  }

  commit();
  return { metadata, phrases };
}

function tryParseJSON(text) {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') return null;

    const metadata = {
      TITLE: data.title || data.name || '',
      ARTIST: data.artist || '',
      BPM: String(data.bpm || ''),
    };

    const phrases = [];
    const tracks = data.tracks || data.players || (data.sections ? [data] : []);
    const tracksList = Array.isArray(tracks) ? tracks : [tracks];
    if (!tracksList.length) return null;

    for (let tIdx = 0; tIdx < tracksList.length; tIdx++) {
      const track = tracksList[tIdx];
      if (!track) continue;
      const singer = tracksList.length > 1 ? tIdx + 1 : null;
      const sections = track.sections || track.phrases || [];
      for (const section of sections) {
        const notes = section.notes || [];
        if (!notes.length) continue;
        const phrase = notes.map((n) => ({
          type: n.type === 'star' ? '*' : ':',
          start: n.start ?? n.startBeat ?? 0,
          duration: n.length ?? n.duration ?? 1,
          pitch: n.pitch ?? 0,
          syllable: n.lyrics ?? n.syllable ?? '',
        }));
        phrases.push({ singer, notes: phrase });
      }
    }

    return phrases.length > 0 ? { metadata, phrases } : null;
  } catch {
    return null;
  }
}

function normalizePitchConvention(phrases) {
  const allPitches = [];
  for (const p of phrases) {
    for (const n of p.notes) allPitches.push(n.pitch);
  }
  if (allPitches.length === 0) return;
  const sorted = [...allPitches].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Songs encoded as raw MIDI have median ~50–75 (vocal range).
  // Songs encoded as semitones-above-C4 have median ~−12 to +12.
  // Threshold of 30 cleanly separates the two conventions.
  if (median > 30) {
    for (const p of phrases) {
      for (const n of p.notes) {
        n.pitch -= 60;
      }
    }
  }
}

export function parse(text) {
  const trimmed = text.trim();
  let result;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    result = tryParseJSON(text);
    if (!result) result = parseUltrastar(text);
  } else {
    result = parseUltrastar(text);
  }
  normalizePitchConvention(result.phrases);
  result.phrases.sort(
    (a, b) => (a.notes[0]?.start ?? 0) - (b.notes[0]?.start ?? 0),
  );
  return result;
}
