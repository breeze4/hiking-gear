import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  emptyText?: string;
  autoFocus?: boolean;
};

export function InlineText({ value, onSave, multiline, placeholder, className, emptyText, autoFocus }: Props) {
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) {
      Promise.resolve(onSave(draft)).catch(() => setDraft(value));
    }
  }
  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={(el) => { inputRef.current = el; }}
          className={`inline-text-input ${className ?? ''}`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          }}
          rows={2}
        />
      );
    }
    return (
      <input
        ref={(el) => { inputRef.current = el; }}
        className={`inline-text-input ${className ?? ''}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
      />
    );
  }

  const isEmpty = !value;
  return (
    <span
      className={`inline-text ${className ?? ''} ${isEmpty ? 'inline-text-empty' : ''}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {isEmpty ? (emptyText ?? placeholder ?? '…') : value}
    </span>
  );
}
