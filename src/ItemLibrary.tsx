import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import type { Item, ItemUsage, ItemWithUsage, Settings } from './types';
import { mgToUnit, unitToMg, WEIGHT_UNITS } from './weight';

type SortKey = 'name' | 'weight' | 'price' | 'usedIn';
type SortDir = 'asc' | 'desc';

export function ItemLibrary() {
  const [items, setItems] = useState<ItemWithUsage[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [usageById, setUsageById] = useState<Record<number, ItemUsage[]>>({});
  const [blockedById, setBlockedById] = useState<Record<number, ItemUsage[]>>({});

  function refresh() {
    return api.itemsAll().then(setItems).catch((e) => setError(String(e)));
  }

  useEffect(() => {
    Promise.all([api.itemsAll(), api.settings()]).then(([i, s]) => {
      setItems(i);
      setSettings(s);
    }).catch((e) => setError(String(e)));
  }, []);

  const sorted = useMemo(() => {
    if (!items) return [];
    const arr = [...items];
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'weight': av = a.weight; bv = b.weight; break;
        case 'price': av = a.price; bv = b.price; break;
        case 'usedIn': av = a.usedIn; bv = b.usedIn; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  function clickHeader(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'usedIn' ? 'desc' : 'asc'); }
  }

  function arrow(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  async function expand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!usageById[id]) {
      try {
        const usage = await api.itemUsage(id);
        setUsageById((cur) => ({ ...cur, [id]: usage }));
      } catch (e) {
        setError(String(e));
      }
    }
  }

  async function handleDelete(item: ItemWithUsage) {
    if (!window.confirm(`Delete "${item.name}" from the library?`)) return;
    try {
      await api.deleteItem(item.id);
      setBlockedById((cur) => { const n = { ...cur }; delete n[item.id]; return n; });
      await refresh();
    } catch (e: any) {
      if (e?.status === 409 && e?.data?.usedIn) {
        const usedIn: ItemUsage[] = e.data.usedIn.map((r: any) => ({ ...r, qty: r.qty ?? 0, worn: !!r.worn, consumable: !!r.consumable }));
        setBlockedById((cur) => ({ ...cur, [item.id]: usedIn }));
        setExpandedId(item.id);
      } else {
        setError(e?.message ?? String(e));
      }
    }
  }

  async function saveItem(id: number, patch: Partial<Item>) {
    try {
      await api.updateItem(id, patch);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createItem(values: Partial<Item>) {
    try {
      await api.createItem(values);
      setCreating(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) return <div className="error">Error: {error}</div>;
  if (!items || !settings) return <div className="loading">Loading…</div>;

  const totalUnit = settings.totalUnit;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Item library</h1>
        <button type="button" className="button primary" onClick={() => setCreating(true)}>+ New item</button>
      </div>
      {creating && (
        <div className="library-create">
          <ItemEditor
            initial={{ name: '', description: '', weight: 0, authorUnit: 'oz', price: 0, url: '', imageUrl: '' }}
            onCancel={() => setCreating(false)}
            onSubmit={createItem}
            submitLabel="Create item"
          />
        </div>
      )}
      <table className="library-table">
        <thead>
          <tr>
            <th className="library-name" onClick={() => clickHeader('name')}>Name{arrow('name')}</th>
            <th className="library-weight" onClick={() => clickHeader('weight')}>Weight{arrow('weight')}</th>
            <th className="library-price" onClick={() => clickHeader('price')}>Price{arrow('price')}</th>
            <th className="library-used" onClick={() => clickHeader('usedIn')}>Used in{arrow('usedIn')}</th>
            <th className="library-actions"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <RowAndDetail
              key={it.id}
              item={it}
              totalUnit={totalUnit}
              currency={settings.currencySymbol}
              expanded={expandedId === it.id}
              onExpand={() => expand(it.id)}
              onDelete={() => handleDelete(it)}
              onSave={(patch) => saveItem(it.id, patch)}
              usage={usageById[it.id]}
              blockedUsage={blockedById[it.id]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowAndDetail({ item, totalUnit, currency, expanded, onExpand, onDelete, onSave, usage, blockedUsage }: {
  item: ItemWithUsage;
  totalUnit: string;
  currency: string;
  expanded: boolean;
  onExpand: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<Item>) => void;
  usage?: ItemUsage[];
  blockedUsage?: ItemUsage[];
}) {
  return (
    <>
      <tr className={`library-row ${expanded ? 'library-row-open' : ''}`} onClick={onExpand}>
        <td>{item.name || `(unnamed #${item.id})`}</td>
        <td className="library-weight">{mgToUnit(item.weight, totalUnit).toFixed(2)} {totalUnit}</td>
        <td className="library-price">{item.price ? `${currency}${item.price.toFixed(2)}` : ''}</td>
        <td className="library-used">{item.usedIn}</td>
        <td className="library-actions">
          <button
            type="button"
            className="button button-small button-danger"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >Delete</button>
        </td>
      </tr>
      {expanded && (
        <tr className="library-detail">
          <td colSpan={5}>
            <div className="library-detail-grid">
              <ItemEditor
                initial={item}
                onSubmit={(patch) => onSave(patch)}
                submitLabel="Save"
              />
              <UsagePanel usage={usage} blocked={blockedUsage} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsagePanel({ usage, blocked }: { usage?: ItemUsage[]; blocked?: ItemUsage[] }) {
  if (blocked) {
    return (
      <div className="library-usage library-usage-blocked">
        <div className="library-usage-title">Cannot delete — still used in:</div>
        <ul>
          {blocked.map((u, i) => (
            <li key={i}>
              <Link to={`/?list=${u.listId}`}>{u.listName || `(untitled #${u.listId})`}</Link>
              {' › '}{u.categoryName}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!usage) return <div className="library-usage">Loading usage…</div>;
  if (!usage.length) return <div className="library-usage"><em>Not used in any trip.</em></div>;
  return (
    <div className="library-usage">
      <div className="library-usage-title">Used in:</div>
      <ul>
        {usage.map((u, i) => (
          <li key={i}>
            <Link to={`/?list=${u.listId}`}>{u.listName || `(untitled #${u.listId})`}</Link>
            {' › '}{u.categoryName}
            {' '}<span className="library-usage-meta">×{u.qty}{u.worn ? ' worn' : ''}{u.consumable ? ' consumable' : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemEditor({ initial, onSubmit, onCancel, submitLabel }: {
  initial: Partial<Item>;
  onSubmit: (patch: Partial<Item>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [unit, setUnit] = useState(initial.authorUnit ?? 'oz');
  const [weight, setWeight] = useState(String(mgToUnit(initial.weight ?? 0, initial.authorUnit ?? 'oz').toFixed(2)));
  const [price, setPrice] = useState(String(initial.price ?? 0));
  const [url, setUrl] = useState(initial.url ?? '');
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? '');
  const [singleton, setSingleton] = useState(initial.singleton ?? true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      weight: unitToMg(Number(weight) || 0, unit),
      authorUnit: unit,
      price: Number(price) || 0,
      url: url.trim(),
      imageUrl: imageUrl.trim(),
      singleton,
    });
  }

  return (
    <form className="library-editor" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <label className="field">
        <span className="field-label">Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
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
      <label className="field">
        <span className="field-label">Image URL</span>
        <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Usually qty=1 (singleton)</span>
        <input type="checkbox" checked={singleton} onChange={(e) => setSingleton(e.target.checked)} />
      </label>
      <div className="form-actions">
        <button type="submit" className="button primary">{submitLabel}</button>
        {onCancel && <button type="button" className="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
