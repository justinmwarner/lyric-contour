export const MIDI_C4 = 60;

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', 'sol', 'si', 'la', 'li', 'ti'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export function midiOf(pitch, transpose = 0) {
  return pitch + MIDI_C4 + transpose;
}

export function noteName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES_SHARP[pc]}${octave}`;
}

export function solfege(midi, tonicMidi = MIDI_C4) {
  const interval = ((midi - tonicMidi) % 12 + 12) % 12;
  return SOLFEGE[interval];
}

export function frequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq) {
  if (!freq || freq <= 0) return null;
  return 69 + 12 * Math.log2(freq / 440);
}

export function isBlackKey(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return BLACK_KEYS.has(pc);
}

export function isNatural(midi) {
  return !isBlackKey(midi);
}
