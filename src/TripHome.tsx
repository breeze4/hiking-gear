import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import type { ListDetail, ListSummary, Settings } from './types';
import { TripView } from './TripView';

export function TripHome() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  function selectList(id: number, replace = false) {
    setSelectedId(id);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('list', String(id));
      return next;
    }, { replace });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.settings(), api.lists(showArchived)])
      .then(([s, l]) => {
        if (cancelled) return;
        setSettings(s);
        setLists(l);
        if (l.length) {
          const sorted = [...l].sort((a, b) => b.id - a.id);
          const requested = requestedListId ? Number(requestedListId) : null;
          const initial = requested && sorted.find((x) => x.id === requested) ? requested : sorted[0].id;
          setSelectedId(initial);
          if (requested !== initial) {
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.set('list', String(initial));
              return next;
            }, { replace: true });
          }
        }
      })
      .catch((e) => setError(String(e)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedListId, setSearchParams, showArchived]);

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
    selectList(newList.id);
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
      selectList(sorted[0].id, true);
    } else {
      setSelectedId(null);
      setDetail(null);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('list');
        return next;
      }, { replace: true });
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
      if (sorted.length) {
        selectList(sorted[0].id, true);
      } else {
        setSelectedId(null);
        setDetail(null);
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete('list');
          return next;
        }, { replace: true });
      }
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
          onChange={(e) => selectList(Number(e.target.value))}
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
