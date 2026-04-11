import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import type { TemplateSummary } from './types';

export function TemplatesList() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.templates().then(setTemplates).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Error: {error}</div>;
  if (!templates) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <h1>Templates</h1>
      {templates.length === 0 ? (
        <p>No templates yet.</p>
      ) : (
        <ul className="template-list">
          {templates.map((t) => (
            <li key={t.id} className="template-row">
              <Link to={`/templates/${t.slug}`} className="template-link">
                <div className="template-name">{t.name}</div>
                <div className="template-meta">
                  {t.categoryCount} categories · {t.itemCount} items
                  {t.source && (
                    <>
                      {' · '}
                      <a href={t.source} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>source</a>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
