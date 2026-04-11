import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, Minus, Pencil, Plus, RotateCcw, Trash2, X, CircleSlash } from 'lucide-react';
import { api } from './api';
import { AddItemModal } from './AddItemModal';
import { InlineText } from './InlineText';
import { RowEditModal } from './RowEditModal';
import { Button } from '@/components/ui/button';
import type { Category, CategoryItem, ListDetail, ListSummary, Settings } from './types';
import { formatWeight, mgToUnit } from './weight';

type PrepField = 'acquired' | 'weighed' | 'packed';
type CategoryItemPatch = {
  qty?: number;
  worn?: boolean;
  consumable?: boolean;
  acquired?: boolean;
  weighed?: boolean;
  packed?: boolean;
};
type ItemPatch = { acquired?: boolean; weighed?: boolean };

type Props = {
  list: ListDetail;
  settings: Settings;
  onListChanged?: () => void;
  onClone?: (newList: ListSummary) => void;
  onDelete?: () => void;
  onArchivedChange?: (archived: boolean) => void;
};

type CategoryTotals = {
  weight: number;
  worn: number;
  consumable: number;
  price: number;
  qty: number;
};

function categoryTotals(cat: Category): CategoryTotals {
  let weight = 0;
  let worn = 0;
  let consumable = 0;
  let price = 0;
  let qty = 0;
  for (const it of cat.items) {
    const w = it.weight * it.qty;
    weight += w;
    price += it.price * it.qty;
    qty += it.qty;
    if (it.worn && it.qty > 0) worn += it.weight;
    if (it.consumable) consumable += w;
  }
  return { weight, worn, consumable, price, qty };
}

export function TripView({ list, settings, onListChanged, onClone, onDelete, onArchivedChange }: Props) {
  const [draft, setDraft] = useState<ListDetail>(list);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ categoryId: number; itemId: number } | null>(null);
  const [addItemForCat, setAddItemForCat] = useState<number | null>(null);
  const [autoFocusCatId, setAutoFocusCatId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { setDraft(list); }, [list]);

  function handleErr(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    window.setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 4000);
  }

  async function saveListField(patch: { name?: string; description?: string }) {
    const prev = draft;
    setDraft({ ...draft, ...patch });
    try {
      await api.updateList(draft.id, patch);
      onListChanged?.();
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function addCategory() {
    try {
      const created = await api.createCategory({ listId: draft.id, name: 'New category' });
      setDraft({
        ...draft,
        categories: [
          ...draft.categories,
          { id: created.id, name: created.name, color: null, position: created.position, items: [] },
        ],
      });
      setAutoFocusCatId(created.id);
      onListChanged?.();
    } catch (e) {
      handleErr(e);
    }
  }

  async function renameCategory(catId: number, name: string) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => c.id === catId ? { ...c, name } : c),
    });
    try {
      await api.updateCategory(catId, { name });
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function deleteCategory(catId: number) {
    if (!window.confirm('Delete this category and all its items?')) return;
    const prev = draft;
    setDraft({ ...draft, categories: draft.categories.filter((c) => c.id !== catId) });
    try {
      await api.deleteCategory(catId);
      onListChanged?.();
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function patchCategoryItem(catId: number, itemId: number, patch: CategoryItemPatch) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => c.id !== catId ? c : {
        ...c,
        items: c.items.map((it) => {
          if (it.itemId !== itemId) return it;
          const nextCiAcquired = 'acquired' in patch ? !!patch.acquired : it.ciAcquired;
          const nextCiWeighed = 'weighed' in patch ? !!patch.weighed : it.ciWeighed;
          const nextPacked = 'packed' in patch ? !!patch.packed : it.packed;
          const next: CategoryItem = {
            ...it,
            ...patch,
            ciAcquired: nextCiAcquired,
            ciWeighed: nextCiWeighed,
            packed: nextPacked,
            effective: {
              acquired: it.singleton ? it.itemAcquired : nextCiAcquired,
              weighed: it.singleton ? it.itemWeighed : nextCiWeighed,
              packed: nextPacked,
            },
          };
          return next;
        }),
      }),
    });
    try {
      await api.updateCategoryItem(catId, itemId, patch);
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function patchItem(itemId: number, patch: ItemPatch) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => ({
        ...c,
        items: c.items.map((it) => {
          if (it.itemId !== itemId) return it;
          const nextItemAcquired = 'acquired' in patch ? !!patch.acquired : it.itemAcquired;
          const nextItemWeighed = 'weighed' in patch ? !!patch.weighed : it.itemWeighed;
          const next: CategoryItem = {
            ...it,
            itemAcquired: nextItemAcquired,
            itemWeighed: nextItemWeighed,
            effective: {
              acquired: it.singleton ? nextItemAcquired : it.ciAcquired,
              weighed: it.singleton ? nextItemWeighed : it.ciWeighed,
              packed: it.packed,
            },
          };
          return next;
        }),
      })),
    });
    try {
      await api.patchItem(itemId, patch);
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function unlinkItem(catId: number, itemId: number) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => c.id !== catId ? c : {
        ...c, items: c.items.filter((it) => it.itemId !== itemId),
      }),
    });
    try {
      await api.unlinkCategoryItem(catId, itemId);
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function reorderCategories(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.categories.findIndex((c) => c.id === Number(active.id));
    const newIndex = draft.categories.findIndex((c) => c.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(draft.categories, oldIndex, newIndex);
    const prev = draft;
    setDraft({ ...draft, categories: next });
    try {
      await api.reorderCategories(draft.id, next.map((c) => c.id));
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function reorderItems(catId: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const cat = draft.categories.find((c) => c.id === catId);
    if (!cat) return;
    const oldIndex = cat.items.findIndex((it) => it.itemId === Number(active.id));
    const newIndex = cat.items.findIndex((it) => it.itemId === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextItems = arrayMove(cat.items, oldIndex, newIndex);
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => c.id !== catId ? c : { ...c, items: nextItems }),
    });
    try {
      await api.reorderItems(catId, nextItems.map((it) => it.itemId));
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function cloneTrip() {
    setMenuOpen(false);
    try {
      const created = await api.cloneList(draft.id);
      onClone?.(created);
    } catch (e) {
      handleErr(e);
    }
  }

  async function deleteTrip() {
    setMenuOpen(false);
    if (!window.confirm('Delete this trip permanently?')) return;
    try {
      onDelete?.();
    } catch (e) {
      handleErr(e);
    }
  }

  async function toggleArchive() {
    setMenuOpen(false);
    onArchivedChange?.(!draft.archived);
  }

  async function refreshList() {
    try {
      const fresh = await api.list(draft.id);
      setDraft(fresh);
    } catch (e) {
      handleErr(e);
    }
  }

  const totals = useMemo(() => {
    let weight = 0;
    let worn = 0;
    let consumable = 0;
    let price = 0;
    let qty = 0;
    for (const cat of draft.categories) {
      const t = categoryTotals(cat);
      weight += t.weight;
      worn += t.worn;
      consumable += t.consumable;
      price += t.price;
      qty += t.qty;
    }
    return { weight, worn, consumable, price, qty, base: weight - worn - consumable, pack: weight - worn };
  }, [draft]);

  const totalUnit = settings.totalUnit;

  return (
    <div className="trip">
      {error && <div className="floating-error">{error}</div>}
      <div className="trip-header">
        <div className="trip-title-row">
          <h1>
            <InlineText
              value={draft.name}
              onSave={(v) => saveListField({ name: v })}
              placeholder="(untitled)"
              emptyText={`(untitled #${draft.id})`}
            />
            {draft.archived && <span className="archived-tag">archived</span>}
          </h1>
          <div className="trip-menu-wrapper">
            <button
              type="button"
              className="button trip-menu-toggle"
              aria-label="Trip menu"
              onClick={() => setMenuOpen((v) => !v)}
            >⋯</button>
            {menuOpen && (
              <div className="trip-menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" onClick={cloneTrip}>Clone</button>
                <button type="button" onClick={toggleArchive}>{draft.archived ? 'Unarchive' : 'Archive'}</button>
                <button type="button" className="trip-menu-danger" onClick={deleteTrip}>Delete</button>
              </div>
            )}
          </div>
        </div>
        <p className="trip-description">
          <InlineText
            value={draft.description}
            onSave={(v) => saveListField({ description: v })}
            multiline
            placeholder="Add a description…"
            emptyText="Add a description…"
          />
        </p>
        <div className="totals">
          <Totalish label="Base" mg={totals.base} unit={totalUnit} />
          <Totalish label="Worn" mg={totals.worn} unit={totalUnit} />
          <Totalish label="Consumable" mg={totals.consumable} unit={totalUnit} />
          <Totalish label="Pack" mg={totals.pack} unit={totalUnit} />
          <Totalish label="Total" mg={totals.weight} unit={totalUnit} />
          <div className="total">
            <span className="total-label">Items</span>
            <span className="total-value">{totals.qty}</span>
          </div>
          <div className="total">
            <span className="total-label">Price</span>
            <span className="total-value">{settings.currencySymbol}{totals.price.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderCategories}>
        <SortableContext items={draft.categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {draft.categories.map((cat) => (
            <SortableCategory
              key={cat.id}
              cat={cat}
              currency={settings.currencySymbol}
              totalUnit={totalUnit}
              autoFocusName={autoFocusCatId === cat.id}
              onRename={(v) => renameCategory(cat.id, v)}
              onDelete={() => deleteCategory(cat.id)}
              onAddItem={() => setAddItemForCat(cat.id)}
              onPatchCi={(itemId, patch) => patchCategoryItem(cat.id, itemId, patch)}
              onPatchItem={(itemId, patch) => patchItem(itemId, patch)}
              onUnlink={(itemId) => unlinkItem(cat.id, itemId)}
              onItemsReorder={(ev) => reorderItems(cat.id, ev)}
              sensors={sensors}
              onRequestEdit={(itemId) => setEditTarget({ categoryId: cat.id, itemId })}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="add-category-row">
        <button type="button" className="button" onClick={addCategory}>+ Add category</button>
      </div>

      {addItemForCat != null && (
        <AddItemModal
          categoryId={addItemForCat}
          onClose={() => setAddItemForCat(null)}
          onLinked={() => { setAddItemForCat(null); refreshList(); }}
        />
      )}

      {editTarget && (() => {
        const cat = draft.categories.find((c) => c.id === editTarget.categoryId);
        const ci = cat?.items.find((it) => it.itemId === editTarget.itemId);
        if (!ci) return null;
        return (
          <RowEditModal
            categoryId={editTarget.categoryId}
            item={ci}
            onClose={() => setEditTarget(null)}
            onSaved={(patched) => {
              setDraft((d) => ({
                ...d,
                categories: d.categories.map((c) => c.id !== editTarget.categoryId ? c : {
                  ...c,
                  items: c.items.map((it) => it.itemId !== editTarget.itemId ? it : patched),
                }),
              }));
              setEditTarget(null);
            }}
          />
        );
      })()}
    </div>
  );
}

type SortableCategoryProps = {
  cat: Category;
  currency: string;
  totalUnit: string;
  autoFocusName: boolean;
  onRename: (v: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onPatchCi: (itemId: number, patch: CategoryItemPatch) => void;
  onPatchItem: (itemId: number, patch: ItemPatch) => void;
  onUnlink: (itemId: number) => void;
  onItemsReorder: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onRequestEdit: (itemId: number) => void;
};

function SortableCategory(props: SortableCategoryProps) {
  const { cat, currency, totalUnit, autoFocusName, onRename, onDelete, onAddItem, onPatchCi, onPatchItem, onUnlink, onItemsReorder, sensors, onRequestEdit } = props;
  const sortable = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };
  const t = useMemo(() => categoryTotals(cat), [cat]);

  return (
    <section ref={sortable.setNodeRef} style={style} className="category">
      <header className="category-header">
        <button
          type="button"
          className="drag-handle category-drag"
          aria-label="Drag category"
          {...sortable.attributes}
          {...sortable.listeners}
        >⋮⋮</button>
        <h2>
          <InlineText
            value={cat.name}
            onSave={onRename}
            placeholder="Category name"
            emptyText="(unnamed category)"
            autoFocus={autoFocusName}
          />
        </h2>
        <div className="category-totals">
          <span>{formatWeight(t.weight, totalUnit)}</span>
          <span>•</span>
          <span>{t.qty} items</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="category-delete text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete category"
            title="Delete category"
          >
            <X />
          </Button>
        </div>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemsReorder}>
        <SortableContext items={cat.items.map((it) => it.itemId)} strategy={verticalListSortingStrategy}>
          <table className="items">
            <thead>
              <tr>
                <th className="col-drag"></th>
                <th>Name</th>
                <th>Description</th>
                <th className="col-flags">Worn</th>
                <th className="col-flags">Cons</th>
                <th className="col-prep">Acq</th>
                <th className="col-prep">Wgh</th>
                <th className="col-prep">Pkd</th>
                <th className="col-weight">Weight</th>
                <th className="col-price">Price</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {cat.items.map((it) => (
                <SortableItemRow
                  key={it.itemId}
                  item={it}
                  categoryId={cat.id}
                  currency={currency}
                  onPatchCi={(patch) => onPatchCi(it.itemId, patch)}
                  onPatchItem={(patch) => onPatchItem(it.itemId, patch)}
                  onUnlink={() => onUnlink(it.itemId)}
                  onRequestEdit={() => onRequestEdit(it.itemId)}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
      <div className="category-footer">
        <button type="button" className="button-link" onClick={onAddItem}>+ Add item</button>
      </div>
    </section>
  );
}

type ItemRowProps = {
  item: CategoryItem;
  categoryId: number;
  currency: string;
  onPatchCi: (patch: CategoryItemPatch) => void;
  onPatchItem: (patch: ItemPatch) => void;
  onUnlink: () => void;
  onRequestEdit: () => void;
};

function SortableItemRow(props: ItemRowProps) {
  const sortable = useSortable({ id: props.item.itemId });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };
  return (
    <ItemRow
      {...props}
      sortableRef={sortable.setNodeRef}
      sortableStyle={style}
      dragAttributes={sortable.attributes}
      dragListeners={sortable.listeners}
    />
  );
}

type ItemRowExtraProps = ItemRowProps & {
  sortableRef?: (el: HTMLElement | null) => void;
  sortableStyle?: React.CSSProperties;
  dragAttributes?: Record<string, any>;
  dragListeners?: Record<string, any>;
};

function ItemRow({ item, currency, onPatchCi, onPatchItem, onUnlink, onRequestEdit, sortableRef, sortableStyle, dragAttributes, dragListeners }: ItemRowExtraProps) {
  const excluded = item.qty === 0;
  const isSingletonDefault = item.singleton && item.qty === 1;
  const showQtyControls = !excluded && !isSingletonDefault;

  const togglePrep = (field: PrepField) => {
    const next = !item.effective[field];
    const target = item.writeTarget[field];
    if (target === 'item') {
      onPatchItem({ [field]: next } as ItemPatch);
    } else {
      onPatchCi({ [field]: next } as CategoryItemPatch);
    }
  };

  return (
    <tr ref={sortableRef} style={sortableStyle} className={`item-row${excluded ? ' excluded' : ''}`}>
      <td className="col-drag">
        <button
          type="button"
          className="drag-handle"
          aria-label="Drag item"
          onClick={(e) => e.stopPropagation()}
          {...dragAttributes}
          {...dragListeners}
        >⋮⋮</button>
      </td>
      <td>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{item.name || '(unnamed)'}</a>
        ) : (
          item.name || '(unnamed)'
        )}
        {item.priority && (
          <span className={`pill pill-${String(item.priority).toLowerCase()}`}>{item.priority}</span>
        )}
      </td>
      <td className="col-desc">{item.description}</td>
      <td className="col-flags">{item.worn ? '✓' : ''}</td>
      <td className="col-flags">{item.consumable ? '✓' : ''}</td>
      {excluded ? (
        <>
          <td className="col-prep" />
          <td className="col-prep" />
          <td className="col-prep" />
        </>
      ) : (
        <>
          <td className="col-prep">
            <PrepCell label="Acquired" checked={item.effective.acquired} onToggle={() => togglePrep('acquired')} />
          </td>
          <td className="col-prep">
            <PrepCell label="Weighed" checked={item.effective.weighed} onToggle={() => togglePrep('weighed')} />
          </td>
          <td className="col-prep">
            <PrepCell label="Packed" checked={item.effective.packed} onToggle={() => togglePrep('packed')} />
          </td>
        </>
      )}
      <td className="col-weight">
        {mgToUnit(item.weight, item.authorUnit).toFixed(2)} {item.authorUnit}
      </td>
      <td className="col-price">
        {item.price ? `${currency}${item.price.toFixed(2)}` : ''}
      </td>
      <td className="col-actions">
        <div className="row-actions">
          {showQtyControls ? (
            <div className="qty-controls">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="Decrease qty"
                title="Decrease qty"
                disabled={item.qty <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.qty > 1) onPatchCi({ qty: item.qty - 1 });
                }}
              >
                <Minus />
              </Button>
              <span className="qty-num">{item.qty}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="Increase qty"
                title="Increase qty"
                onClick={(e) => { e.stopPropagation(); onPatchCi({ qty: item.qty + 1 }); }}
              >
                <Plus />
              </Button>
            </div>
          ) : null}
          {excluded ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Keep it"
                title="Keep it (restore to qty 1)"
                onClick={(e) => { e.stopPropagation(); onPatchCi({ qty: 1 }); }}
              >
                <RotateCcw />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove item"
                title="Remove from category"
                onClick={(e) => { e.stopPropagation(); onUnlink(); }}
              >
                <Trash2 />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Set to zero"
              title="Set to zero (leave it off)"
              onClick={(e) => { e.stopPropagation(); onPatchCi({ qty: 0 }); }}
            >
              <CircleSlash />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onRequestEdit(); }}
            aria-label="Edit item"
            title="Edit item"
          >
            <Pencil />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function PrepCell({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`prep-cell-button${checked ? ' prep-checked' : ''}`}
      aria-label={label}
      aria-pressed={checked}
      title={label}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {checked ? <CheckCircle2 /> : <Circle />}
    </Button>
  );
}

function Totalish({ label, mg, unit }: { label: string; mg: number; unit: string }) {
  return (
    <div className="total">
      <span className="total-label">{label}</span>
      <span className="total-value">{formatWeight(mg, unit)}</span>
    </div>
  );
}
