import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Item } from './types';
import { unitToMg, WEIGHT_UNITS } from './weight';

type Props = {
  categoryId: number;
  onClose: () => void;
  onLinked: () => void;
};

export function AddItemModal({ categoryId, onClose, onLinked }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      api.searchItems(q).then(setResults).catch((e) => setError(String(e)));
    }, 200);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [q]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function link(itemId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.linkCategoryItem({ categoryId, itemId });
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Add item</h3>
          <button className="button-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {!creating && (
          <>
            <input
              className="modal-search"
              autoFocus
              type="text"
              placeholder="Search items…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <ul className="picker-list modal-results">
              {results.map((it) => (
                <li key={it.id} className="picker-row">
                  <button
                    type="button"
                    className="picker-button"
                    disabled={busy}
                    onClick={() => link(it.id)}
                  >
                    <span className="picker-name">{it.name || `(unnamed #${it.id})`}</span>
                    {it.description && <span className="picker-desc">{it.description}</span>}
                  </button>
                </li>
              ))}
              {!results.length && <li className="picker-row picker-empty">No matches.</li>}
            </ul>
            <div className="modal-footer">
              <button type="button" className="button" onClick={() => setCreating(true)}>+ Create new item</button>
            </div>
          </>
        )}
        {creating && (
          <CreateForm
            categoryId={categoryId}
            onCancel={() => setCreating(false)}
            onCreated={() => { onLinked(); onClose(); }}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

function CreateForm({ categoryId, onCancel, onCreated, setError }: {
  categoryId: number;
  onCancel: () => void;
  onCreated: () => void;
  setError: (s: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<string>('oz');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('name is required'); return; }
    setBusy(true);
    try {
      const w = weight ? unitToMg(Number(weight), unit) : 0;
      const item = await api.createItem({
        name: name.trim(),
        description: description.trim(),
        weight: w,
        authorUnit: unit,
        price: price ? Number(price) : 0,
        url: url.trim(),
      });
      await api.linkCategoryItem({ categoryId, itemId: item.id });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form className="new-item-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Weight</span>
          <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Price</span>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">URL</span>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>Create &amp; add</button>
        <button type="button" className="button" onClick={onCancel} disabled={busy}>Back</button>
      </div>
    </form>
  );
}
