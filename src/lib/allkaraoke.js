const ORIGIN = 'https://allkaraoke.party';
const INDEX_URL = `${ORIGIN}/songs/index.json`;
const songUrl = (id) => `${ORIGIN}/songs/${id}.txt`;

let indexPromise = null;

export function fetchIndex() {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Index fetch failed: ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export async function fetchSong(id) {
  const r = await fetch(songUrl(id));
  if (!r.ok) throw new Error(`Song fetch failed: ${r.status}`);
  return r.text();
}

export function normalizeQuery(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function scoreEntry(entry, normQ, lowerQ) {
  const search = entry.search || '';
  if (!search.includes(normQ)) {
    const title = (entry.title || '').toLowerCase();
    const artist = (entry.artist || '').toLowerCase();
    if (!title.includes(lowerQ) && !artist.includes(lowerQ)) return -1;
    return 5;
  }
  const title = (entry.title || '').toLowerCase();
  const artist = (entry.artist || '').toLowerCase();
  if (title === lowerQ || artist === lowerQ) return 100;
  if (title.startsWith(lowerQ) || artist.startsWith(lowerQ)) return 50;
  if (title.includes(lowerQ) || artist.includes(lowerQ)) return 20;
  return 10;
}

export function searchIndex(index, query, limit = 60) {
  const lowerQ = (query || '').trim().toLowerCase();
  if (!lowerQ) return [];
  const normQ = normalizeQuery(query);
  if (!normQ) return [];

  const scored = [];
  for (const entry of index) {
    const score = scoreEntry(entry, normQ, lowerQ);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.entry);
}
