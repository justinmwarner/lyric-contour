const LIST_KEY = 'songs-list';
const songKey = (id) => `song-${id}`;

export function loadSongList() {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSongList(list) {
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export function loadSong(id) {
  try {
    const raw = localStorage.getItem(songKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSong(id, data) {
  localStorage.setItem(songKey(id), JSON.stringify(data));
}

export function deleteSong(id) {
  localStorage.removeItem(songKey(id));
}

export function slugify(s) {
  return (
    (s || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'untitled'
  );
}
