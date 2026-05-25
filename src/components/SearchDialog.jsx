import { useEffect, useRef, useState } from 'react';
import { fetchIndex, fetchSong, searchIndex } from '../lib/allkaraoke.js';

export default function SearchDialog({ isOpen, onClose, onPick }) {
  const [index, setIndex] = useState(null);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [indexError, setIndexError] = useState(null);
  const [query, setQuery] = useState('');
  const [fetchingId, setFetchingId] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || index || loadingIndex) return;
    setLoadingIndex(true);
    setIndexError(null);
    fetchIndex()
      .then((data) => setIndex(data))
      .catch((err) => setIndexError(String(err)))
      .finally(() => setLoadingIndex(false));
  }, [isOpen, index, loadingIndex]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFetchError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = index ? searchIndex(index, query, 60) : [];

  const handlePick = async (entry) => {
    if (fetchingId) return;
    setFetchingId(entry.id);
    setFetchError(null);
    try {
      const text = await fetchSong(entry.id);
      onPick?.({
        id: entry.id,
        title: entry.title,
        artist: entry.artist,
        text,
      });
    } catch (err) {
      setFetchError(`Couldn't load "${entry.title}". ${err}`);
      setFetchingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Find a song">
        <div className="modal-header">
          <input
            ref={inputRef}
            className="modal-search"
            type="text"
            placeholder="Search artist or song…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {loadingIndex && <div className="modal-status">Loading catalog…</div>}
          {indexError && (
            <div className="modal-status error">
              Couldn't load catalog: {indexError}
            </div>
          )}
          {!loadingIndex && !indexError && index && query.trim() === '' && (
            <div className="modal-status">
              {index.length.toLocaleString()} songs in AllKaraoke's catalog. Start typing
              to search.
            </div>
          )}
          {!loadingIndex && index && query.trim() !== '' && results.length === 0 && (
            <div className="modal-status">No matches.</div>
          )}
          {fetchError && <div className="modal-status error">{fetchError}</div>}

          {results.length > 0 && (
            <ul className="modal-results">
              {results.map((r) => (
                <li
                  key={r.id}
                  className={`result-row ${fetchingId === r.id ? 'busy' : ''}`}
                  onClick={() => handlePick(r)}
                >
                  <div className="result-main">
                    <div className="result-title">{r.title}</div>
                    <div className="result-artist">{r.artist}</div>
                  </div>
                  <div className="result-meta">
                    {r.year && <span>{r.year}</span>}
                    {Array.isArray(r.language) && r.language[0] && (
                      <span>{r.language[0]}</span>
                    )}
                    {r.genre && <span>{r.genre}</span>}
                  </div>
                  {fetchingId === r.id && <div className="result-spinner">…</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          Catalog from <a href="https://allkaraoke.party" target="_blank" rel="noreferrer">AllKaraoke.party</a>
          {' · '}<kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
