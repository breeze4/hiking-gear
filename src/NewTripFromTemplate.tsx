import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { isDefaultTemplateSelection, PRIORITIES } from './lib/priority';
import { priorityClass } from './TemplateDetail';
import type { Priority, Template } from './types';

const PRIORITY_ORDER: Priority[] = PRIORITIES;

export function NewTripFromTemplate() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<Template | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showUnnecessary, setShowUnnecessary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.template(slug).then((tpl) => {
      setTemplate(tpl);
      const initial: Record<number, boolean> = {};
      for (const cat of tpl.categories) {
        for (const item of cat.items) {
          initial[item.id] = isDefaultTemplateSelection(item.priority);
        }
      }
      setChecked(initial);
    }).catch((e) => setLoadError(String(e)));
  }, [slug]);

  const counts = useMemo(() => {
    if (!template) return { items: 0, categories: 0 };
    let items = 0;
    let categories = 0;
    for (const cat of template.categories) {
      const inCat = cat.items.filter((it) => checked[it.id]).length;
      if (inCat > 0) {
        items += inCat;
        categories += 1;
      }
    }
    return { items, categories };
  }, [template, checked]);

  if (loadError) return <div className="error">Error: {loadError}</div>;
  if (!template) return <div className="loading">Loading…</div>;

  function toggle(id: number) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError('Name is required');
      return;
    }
    const itemIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => Number(k));
    if (!itemIds.length) {
      setSubmitError('Select at least one item');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createFromTemplate({ slug: template!.slug, name: name.trim(), itemIds });
      navigate(`/?list=${res.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>New trip from {template.name}</h1>

      <form onSubmit={submit} className="new-trip-form">
        <label className="field">
          <span className="field-label">Trip name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sierra High Route"
            required
          />
        </label>

        <div className="counter-bar">
          <strong>{counts.items}</strong> items selected across <strong>{counts.categories}</strong> categories
          <label className="show-unnecessary">
            <input
              type="checkbox"
              checked={showUnnecessary}
              onChange={(e) => setShowUnnecessary(e.target.checked)}
            />
            Show unnecessary items
          </label>
        </div>

        {template.categories.map((cat) => {
          const visible = cat.items.filter((it) => showUnnecessary || it.priority !== 'Unnecessary');
          if (!visible.length) return null;
          const ordered = [...visible].sort((a, b) => {
            const ai = PRIORITY_ORDER.indexOf(a.priority as Priority);
            const bi = PRIORITY_ORDER.indexOf(b.priority as Priority);
            if (ai !== bi) return ai - bi;
            return a.position - b.position;
          });
          return (
            <section key={cat.id} className="category">
              <header className="category-header">
                <h2>{cat.name}</h2>
              </header>
              <ul className="picker-list">
                {ordered.map((item) => (
                  <li key={item.id} className="picker-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!checked[item.id]}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="picker-name">{item.name}</span>
                      <span className={priorityClass(item.priority)}>{item.priority}</span>
                      {item.description && <span className="picker-desc">{item.description}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {submitError && <div className="error inline-error">{submitError}</div>}

        <div className="form-actions">
          <button type="submit" className="button primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>
    </div>
  );
}
