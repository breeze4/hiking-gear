import { useEffect, useMemo, useRef, useState } from 'react';
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
import { api } from './api';
import { AddItemModal } from './AddItemModal';
import { InlineText } from './InlineText';
import type { Category, CategoryItem, ListDetail, ListSummary, Settings } from './types';
import { formatWeight, mgToUnit, unitToMg, WEIGHT_UNITS } from './weight';

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
  const [editingKey, setEditingKey] = useState<string | null>(null);
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

  async function patchCategoryItem(catId: number, itemId: number, patch: { qty?: number; worn?: boolean; consumable?: boolean }) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => c.id !== catId ? c : {
        ...c,
        items: c.items.map((it) => it.itemId !== itemId ? it : { ...it, ...patch } as CategoryItem),
      }),
    });
    try {
      await api.updateCategoryItem(catId, itemId, patch);
    } catch (e) {
      setDraft(prev);
      handleErr(e);
    }
  }

  async function patchItem(itemId: number, patch: Partial<CategoryItem>) {
    const prev = draft;
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => ({
        ...c,
        items: c.items.map((it) => it.itemId !== itemId ? it : { ...it, ...patch } as CategoryItem),
      })),
    });
    try {
      const apiPatch: any = {};
      if ('name' in patch) apiPatch.name = patch.name;
      if ('description' in patch) apiPatch.description = patch.description;
      if ('weight' in patch) apiPatch.weight = patch.weight;
      if ('authorUnit' in patch) apiPatch.authorUnit = patch.authorUnit;
      if ('price' in patch) apiPatch.price = patch.price;
      if ('url' in patch) apiPatch.url = patch.url;
      await api.updateItem(itemId, apiPatch);
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
              editingKey={editingKey}
              setEditingKey={setEditingKey}
              onRename={(v) => renameCategory(cat.id, v)}
              onDelete={() => deleteCategory(cat.id)}
              onAddItem={() => setAddItemForCat(cat.id)}
              onPatchCi={(itemId, patch) => patchCategoryItem(cat.id, itemId, patch)}
              onPatchItem={(itemId, patch) => patchItem(itemId, patch)}
              onUnlink={(itemId) => unlinkItem(cat.id, itemId)}
              onItemsReorder={(ev) => reorderItems(cat.id, ev)}
              sensors={sensors}
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
    </div>
  );
}

type SortableCategoryProps = {
  cat: Category;
  currency: string;
  totalUnit: string;
  autoFocusName: boolean;
  editingKey: string | null;
  setEditingKey: (k: string | null | ((cur: string | null) => string | null)) => void;
  onRename: (v: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onPatchCi: (itemId: number, patch: { qty?: number; worn?: boolean; consumable?: boolean }) => void;
  onPatchItem: (itemId: number, patch: Partial<CategoryItem>) => void;
  onUnlink: (itemId: number) => void;
  onItemsReorder: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
};

function SortableCategory(props: SortableCategoryProps) {
  const { cat, currency, totalUnit, autoFocusName, editingKey, setEditingKey, onRename, onDelete, onAddItem, onPatchCi, onPatchItem, onUnlink, onItemsReorder, sensors } = props;
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
          <button
            type="button"
            className="row-action category-delete"
            onClick={onDelete}
            aria-label="Delete category"
            title="Delete category"
          >×</button>
        </div>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemsReorder}>
        <SortableContext items={cat.items.map((it) => it.itemId)} strategy={verticalListSortingStrategy}>
          <table className="items">
            <thead>
              <tr>
                <th className="col-drag"></th>
                <th className="col-qty">Qty</th>
                <th>Name</th>
                <th>Description</th>
                <th className="col-flags">Worn</th>
                <th className="col-flags">Cons</th>
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
                  editing={editingKey === `${cat.id}:${it.itemId}`}
                  onEdit={() => setEditingKey(`${cat.id}:${it.itemId}`)}
                  onLeave={() => setEditingKey((k) => k === `${cat.id}:${it.itemId}` ? null : k)}
                  onPatchCi={(patch) => onPatchCi(it.itemId, patch)}
                  onPatchItem={(patch) => onPatchItem(it.itemId, patch)}
                  onUnlink={() => onUnlink(it.itemId)}
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
  editing: boolean;
  onEdit: () => void;
  onLeave: () => void;
  onPatchCi: (patch: { qty?: number; worn?: boolean; consumable?: boolean }) => void;
  onPatchItem: (patch: Partial<CategoryItem>) => void;
  onUnlink: () => void;
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

function ItemRow({ item, currency, editing, onEdit, onLeave, onPatchCi, onPatchItem, onUnlink, sortableRef, sortableStyle, dragAttributes, dragListeners }: ItemRowExtraProps) {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const setRefs = (el: HTMLTableRowElement | null) => {
    rowRef.current = el;
    if (sortableRef) sortableRef(el);
  };
  // local text drafts so debounced text fields don't flicker
  const [name, setName] = useState(item.name);
  const [desc, setDesc] = useState(item.description);
  const [qty, setQty] = useState(String(item.qty));
  const [weightVal, setWeightVal] = useState(String(mgToUnit(item.weight, item.authorUnit).toFixed(2)));
  const [unit, setUnit] = useState(item.authorUnit);
  const [price, setPrice] = useState(String(item.price));

  useEffect(() => {
    setName(item.name);
    setDesc(item.description);
    setQty(String(item.qty));
    setWeightVal(String(mgToUnit(item.weight, item.authorUnit).toFixed(2)));
    setUnit(item.authorUnit);
    setPrice(String(item.price));
  }, [item.itemId, item.name, item.description, item.qty, item.weight, item.authorUnit, item.price]);

  // Click-outside to leave edit mode
  useEffect(() => {
    if (!editing) return;
    function handler(ev: MouseEvent) {
      if (!rowRef.current) return;
      if (rowRef.current.contains(ev.target as Node)) return;
      onLeave();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing, onLeave]);

  function commitName() {
    const v = name.trim();
    if (v !== item.name) onPatchItem({ name: v });
  }
  function commitDesc() {
    if (desc !== item.description) onPatchItem({ description: desc });
  }
  function commitQty() {
    const n = Number(qty);
    if (Number.isFinite(n) && n !== item.qty) onPatchCi({ qty: n });
    else setQty(String(item.qty));
  }
  function commitWeight() {
    const n = Number(weightVal);
    if (!Number.isFinite(n)) { setWeightVal(String(mgToUnit(item.weight, item.authorUnit).toFixed(2))); return; }
    const mg = unitToMg(n, unit);
    if (mg !== item.weight || unit !== item.authorUnit) onPatchItem({ weight: mg, authorUnit: unit });
  }
  function commitPrice() {
    const n = Number(price);
    if (!Number.isFinite(n)) { setPrice(String(item.price)); return; }
    if (n !== item.price) onPatchItem({ price: n });
  }

  if (!editing) {
    return (
      <tr ref={setRefs} style={sortableStyle} className="item-row" onClick={onEdit}>
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
        <td className="col-qty">{item.qty}</td>
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
        <td className="col-weight">
          {mgToUnit(item.weight, item.authorUnit).toFixed(2)} {item.authorUnit}
        </td>
        <td className="col-price">
          {item.price ? `${currency}${item.price.toFixed(2)}` : ''}
        </td>
        <td className="col-actions">
          <button
            type="button"
            className="row-action"
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            aria-label="Remove item"
            title="Remove from category"
          >×</button>
        </td>
      </tr>
    );
  }

  return (
    <tr ref={setRefs} style={sortableStyle} className="item-row item-row-editing">
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
      <td className="col-qty">
        <input
          className="cell-input cell-qty"
          type="number"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commitQty}
        />
      </td>
      <td>
        <input
          className="cell-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
        />
      </td>
      <td>
        <input
          className="cell-input"
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={commitDesc}
        />
      </td>
      <td className="col-flags">
        <input
          type="checkbox"
          checked={item.worn}
          onChange={(e) => onPatchCi({ worn: e.target.checked })}
        />
      </td>
      <td className="col-flags">
        <input
          type="checkbox"
          checked={item.consumable}
          onChange={(e) => onPatchCi({ consumable: e.target.checked })}
        />
      </td>
      <td className="col-weight">
        <input
          className="cell-input cell-weight"
          type="number"
          step="0.01"
          value={weightVal}
          onChange={(e) => setWeightVal(e.target.value)}
          onBlur={commitWeight}
        />
        <select
          className="cell-unit"
          value={unit}
          onChange={(e) => { setUnit(e.target.value); }}
          onBlur={commitWeight}
        >
          {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td className="col-price">
        <input
          className="cell-input cell-price"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
        />
      </td>
      <td className="col-actions">
        <button
          type="button"
          className="row-action"
          onClick={(e) => { e.stopPropagation(); onUnlink(); }}
          aria-label="Remove item"
          title="Remove from category"
        >×</button>
      </td>
    </tr>
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
