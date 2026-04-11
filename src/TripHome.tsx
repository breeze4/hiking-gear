import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import type { ListDetail, ListSummary, Settings } from './types';
import { TripView } from './TripView';

export function TripHome() {
  const [searchParams] = useSearchParams();
  const requestedListId = searchParams.get('list');

  const [settings, setSettings] = useState<Settings | null>(null);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshLists() {
    return api.lists(showArchived).then(setLists).catch((e) => setError(String(e)));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.settings(), api.lists(showArchived)])
      .then(([s, l]) => {
        if (cancelled) return;
        setSettings(s);
        setLists(l);
        if (l.length && selectedId == null) {
          const sorted = [...l].sort((a, b) => b.id - a.id);
          const requested = requestedListId ? Number(requestedListId) : null;
          const initial = requested && sorted.find((x) => x.id === requested) ? requested : sorted[0].id;
          setSelectedId(initial);
        }
      })
      .catch((e) => setError(String(e)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedListId, showArchived]);

  useEffect(() => {
    if (selectedId == null) return;
    setDetail(null);
    api.list(selectedId).then(setDetail).catch((e) => setError(String(e)));
  }, [selectedId]);

  const sortedLists = useMemo(() => {
    if (!lists) return [];
    return [...lists].sort((a, b) => b.id - a.id);
  }, [lists]);

  async function handleCloned(newList: ListSummary) {
    await refreshLists();
    setSelectedId(newList.id);
  }

  async function handleDeleted() {
    if (selectedId == null) return;
    try {
      await api.deleteList(selectedId);
    } catch (e) {
      setError(String(e));
      return;
    }
    const remaining = (lists ?? []).filter((l) => l.id !== selectedId);
    setLists(remaining);
    if (remaining.length) {
      const sorted = [...remaining].sort((a, b) => b.id - a.id);
      setSelectedId(sorted[0].id);
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function handleArchivedChange(archived: boolean) {
    if (selectedId == null) return;
    try {
      await api.setListArchived(selectedId, archived);
    } catch (e) {
      setError(String(e));
      return;
    }
    if (archived && !showArchived) {
      const remaining = (lists ?? []).filter((l) => l.id !== selectedId);
      setLists(remaining);
      const sorted = [...remaining].sort((a, b) => b.id - a.id);
      setSelectedId(sorted.length ? sorted[0].id : null);
      if (!sorted.length) setDetail(null);
    } else {
      await refreshLists();
      setDetail((d) => d ? { ...d, archived } : d);
    }
  }

  if (error) return <div className="error">Error: {error}</div>;
  if (!settings || !lists) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="subbar">
        <select
          className="list-switcher"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {sortedLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.archived ? '📦 ' : ''}{l.name || `(untitled #${l.id})`}
            </option>
          ))}
        </select>
        <label className="show-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      {detail ? (
        <TripView
          key={detail.id}
          list={detail}
          settings={settings}
          onListChanged={refreshLists}
          onClone={handleCloned}
          onDelete={handleDeleted}
          onArchivedChange={handleArchivedChange}
        />
      ) : (
        <div className="loading">{selectedId == null ? 'No lists. Visit /templates to create one.' : 'Loading list…'}</div>
      )}
    </>
  );
}
