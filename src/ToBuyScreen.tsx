import { useEffect, useState } from 'react';
import { api } from './api';
import type { Item, Settings } from './types';
import { mgToUnit } from './weight';
import { Button } from './components/ui/button';

type ToBuyRow = { item: Item; neededQty: number };

export function ToBuyScreen() {
  const [rows, setRows] = useState<ToBuyRow[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.fetchToBuy(), api.settings()])
      .then(([r, s]) => {
        setRows(r);
        setSettings(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function handleAcquire(itemId: number) {
    if (!rows) return;
    const index = rows.findIndex((r) => r.item.id === itemId);
    if (index < 0) return;
    const removed = rows[index];
    const next = rows.slice(0, index).concat(rows.slice(index + 1));
    setRows(next);
    try {
      await api.acquireFromToBuy(itemId);
    } catch (e) {
      // Re-insert at the original position, surface the error.
      setRows((cur) => {
        if (!cur) return cur;
        const restored = cur.slice();
        restored.splice(index, 0, removed);
        return restored;
      });
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error && !rows) return <div className="error">Error: {error}</div>;
  if (!rows || !settings) return <div className="loading">Loading…</div>;

  const currency = settings.currencySymbol;
  const totalUnit = settings.totalUnit;

  return (
    <div className="page">
      <div className="page-header">
        <h1>To buy</h1>
      </div>
      {error && <div className="error">Error: {error}</div>}
      {rows.length === 0 ? (
        <p className="to-buy-empty">Nothing to buy — you're all set.</p>
      ) : (
        <ul className="to-buy-list">
          {rows.map(({ item, neededQty }) => {
            const unit = item.authorUnit || totalUnit;
            const weightDisplay = item.weight > 0
              ? `${mgToUnit(item.weight, unit).toFixed(2)} ${unit}`
              : '';
            const priceDisplay = item.price > 0 ? `${currency}${item.price.toFixed(2)}` : '';
            return (
              <li key={item.id} className="to-buy-row">
                <div className="to-buy-main">
                  <span className="to-buy-name">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">{item.name || `(unnamed #${item.id})`}</a>
                    ) : (
                      item.name || `(unnamed #${item.id})`
                    )}
                  </span>
                  {neededQty > 1 && <span className="to-buy-qty">×{neededQty}</span>}
                  {weightDisplay && <span className="to-buy-meta">{weightDisplay}</span>}
                  {priceDisplay && <span className="to-buy-meta">{priceDisplay}</span>}
                </div>
                <div className="to-buy-actions">
                  <Button type="button" size="sm" onClick={() => handleAcquire(item.id)}>
                    Mark acquired
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
