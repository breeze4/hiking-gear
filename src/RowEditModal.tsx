import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { PRIORITIES } from './lib/priority';
import type { CategoryItem, Item, Priority } from './types';
import { mgToUnit, unitToMg, WEIGHT_UNITS } from './weight';

type Props = {
  categoryId: number;
  item: CategoryItem;
  onClose: () => void;
  onSaved: (patched: CategoryItem) => void;
};

export function RowEditModal({ categoryId, item, onClose, onSaved }: Props) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [unit, setUnit] = useState(item.authorUnit);
  const [weight, setWeight] = useState(String(mgToUnit(item.weight, item.authorUnit).toFixed(2)));
  const [price, setPrice] = useState(String(item.price));
  const [url, setUrl] = useState(item.url);
  const [imageUrl, setImageUrl] = useState(item.imageUrl);
  const [singleton, setSingleton] = useState(item.singleton);
  const [qty, setQty] = useState(String(item.qty));
  const [worn, setWorn] = useState(item.worn);
  const [consumable, setConsumable] = useState(item.consumable);
  const [priority, setPriority] = useState<Priority>(item.priority ?? 'Suggested');
  const [weighed, setWeighed] = useState(item.effective.weighed);
  const [initialWeightMg] = useState(item.weight);
  const userOverrodeWeighed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-check weighed when the weight value is edited to a new numeric value.
  // Skips: NaN (half-typed), empty, same-as-initial, or a prior manual override.
  useEffect(() => {
    if (userOverrodeWeighed.current) return;
    if (weight.trim() === '') return;
    const n = Number(weight);
    if (!Number.isFinite(n)) return;
    const mg = unitToMg(n, unit);
    if (mg !== initialWeightMg) {
      setWeighed(true);
    }
  }, [weight, unit, initialWeightMg]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const itemPatch: Partial<Omit<Item, 'id'>> = {};
    const trimmedName = name.trim();
    if (trimmedName !== item.name) itemPatch.name = trimmedName;
    if (description !== item.description) itemPatch.description = description;
    const weightNum = Number(weight);
    const mg = Number.isFinite(weightNum) ? unitToMg(weightNum, unit) : item.weight;
    if (mg !== item.weight || unit !== item.authorUnit) {
      itemPatch.weight = mg;
      itemPatch.authorUnit = unit;
    }
    const priceNum = Number(price);
    const priceFinal = Number.isFinite(priceNum) ? priceNum : item.price;
    if (priceFinal !== item.price) itemPatch.price = priceFinal;
    if (url.trim() !== item.url) itemPatch.url = url.trim();
    if (imageUrl.trim() !== item.imageUrl) itemPatch.imageUrl = imageUrl.trim();
    if (singleton !== item.singleton) itemPatch.singleton = singleton;

    const ciPatch: { qty?: number; worn?: boolean; consumable?: boolean; priority?: Priority; weighed?: boolean } = {};
    const qtyNum = Number(qty);
    if (Number.isFinite(qtyNum) && qtyNum !== item.qty) ciPatch.qty = qtyNum;
    if (worn !== item.worn) ciPatch.worn = worn;
    if (consumable !== item.consumable) ciPatch.consumable = consumable;
    if (priority !== item.priority) ciPatch.priority = priority;

    if (weighed !== item.effective.weighed) {
      if (item.writeTarget.weighed === 'item') {
        itemPatch.weighed = weighed;
      } else {
        ciPatch.weighed = weighed;
      }
    }

    setBusy(true);
    setError(null);
    try {
      if (Object.keys(itemPatch).length > 0) {
        await api.updateItem(item.itemId, itemPatch);
      }
      if (Object.keys(ciPatch).length > 0) {
        await api.updateCategoryItem(categoryId, item.itemId, ciPatch);
      }
      const weighedWritten = 'weighed' in itemPatch || 'weighed' in ciPatch;
      const patched: CategoryItem = {
        ...item,
        ...itemPatch,
        ...ciPatch,
        itemWeighed:
          item.writeTarget.weighed === 'item' && 'weighed' in itemPatch ? weighed : item.itemWeighed,
        ciWeighed:
          item.writeTarget.weighed === 'categoryItem' && 'weighed' in ciPatch ? weighed : item.ciWeighed,
        effective: {
          ...item.effective,
          weighed: weighedWritten ? weighed : item.effective.weighed,
        },
      } as CategoryItem;
      onSaved(patched);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit item</h3>
          <button className="button-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="library-editor" onSubmit={handleSave}>
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
              <span className="field-label">Weighed</span>
              <input
                type="checkbox"
                checked={weighed}
                onChange={(e) => {
                  userOverrodeWeighed.current = true;
                  setWeighed(e.target.checked);
                }}
              />
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
          <div className="field-row">
            <label className="field">
              <span className="field-label">Qty</span>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Worn</span>
              <input type="checkbox" checked={worn} onChange={(e) => setWorn(e.target.checked)} />
            </label>
            <label className="field">
              <span className="field-label">Consumable</span>
              <input type="checkbox" checked={consumable} onChange={(e) => setConsumable(e.target.checked)} />
            </label>
            <label className="field">
              <span className="field-label">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          {error && <div className="inline-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={busy}>Save</button>
            <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
