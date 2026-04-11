import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api';
import type { Priority, Template, TemplateItem } from './types';

const PRIORITY_ORDER: Priority[] = ['Critical', 'Contingent', 'Suggested', 'Optional', 'Unnecessary'];

export function priorityClass(priority: string | null | undefined): string {
  if (!priority) return '';
  return `pill pill-${priority.toLowerCase()}`;
}

export function TemplateDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.template(slug).then(setTemplate).catch((e) => setError(String(e)));
  }, [slug]);

  if (error) return <div className="error">Error: {error}</div>;
  if (!template) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{template.name}</h1>
        {template.source && (
          <a href={template.source} target="_blank" rel="noreferrer" className="source-link">source</a>
        )}
        <Link to={`/new-trip/${template.slug}`} className="button">New trip from this template</Link>
      </div>

      {template.categories.map((cat) => {
        const grouped = new Map<string, TemplateItem[]>();
        for (const item of cat.items) {
          const arr = grouped.get(item.priority) ?? [];
          arr.push(item);
          grouped.set(item.priority, arr);
        }
        return (
          <section key={cat.id} className="category">
            <header className="category-header">
              <h2>{cat.name}</h2>
              <div className="category-totals">{cat.items.length} items</div>
            </header>
            <div className="template-groups">
              {PRIORITY_ORDER.map((p) => {
                const items = grouped.get(p);
                if (!items?.length) return null;
                return (
                  <div key={p} className="template-group">
                    {items.map((item) => (
                      <div key={item.id} className="template-item">
                        <div className="template-item-head">
                          <span className="template-item-name">{item.name}</span>
                          <span className={priorityClass(item.priority)}>{item.priority}</span>
                        </div>
                        {item.description && <div className="template-item-desc">{item.description}</div>}
                        {item.example && <div className="template-item-example"><em>e.g.</em> {item.example}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
