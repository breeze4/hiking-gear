import type { CategoryItem, Item, ItemUsage, ItemWithUsage, ListDetail, ListSummary, Settings, Template, TemplateSummary } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data)
      ? String((data as { error: unknown }).error)
      : `${url} → ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  settings: () => get<Settings>('/api/settings'),
  lists: (includeArchived = false) => get<ListSummary[]>(`/api/lists${includeArchived ? '?includeArchived=true' : ''}`),
  list: (id: number) => get<ListDetail>(`/api/lists/${id}`),
  templates: () => get<TemplateSummary[]>('/api/templates'),
  template: (slug: string) => get<Template>(`/api/templates/${slug}`),
  createFromTemplate: (body: { slug: string; name: string; itemIds: number[] }) =>
    send<{ id: number; name: string }>('POST', '/api/lists/from-template', body),

  updateList: (id: number, body: { name?: string; description?: string }) =>
    send<ListSummary>('PUT', `/api/lists/${id}`, body),

  createCategory: (body: { listId: number; name: string }) =>
    send<{ id: number; listId: number; name: string; position: number }>('POST', '/api/categories', body),
  updateCategory: (id: number, body: { name?: string }) =>
    send<{ id: number; listId: number; name: string; position: number }>('PUT', `/api/categories/${id}`, body),
  deleteCategory: (id: number) =>
    send<{ ok: true }>('DELETE', `/api/categories/${id}`),

  createItem: (body: Partial<Omit<Item, 'id'>>) =>
    send<Item>('POST', '/api/items', body),
  updateItem: (id: number, body: Partial<Omit<Item, 'id'>>) =>
    send<Item>('PUT', `/api/items/${id}`, body),
  patchItem: (id: number, body: Partial<Omit<Item, 'id'>>) =>
    send<Item>('PUT', `/api/items/${id}`, body),
  searchItems: (q: string) =>
    get<Item[]>(`/api/items?q=${encodeURIComponent(q)}`),

  linkCategoryItem: (body: { categoryId: number; itemId: number; qty?: number; worn?: boolean; consumable?: boolean }) =>
    send<CategoryItem>('POST', '/api/category_items', body),
  updateCategoryItem: (categoryId: number, itemId: number, body: { qty?: number; worn?: boolean; consumable?: boolean; star?: boolean; acquired?: boolean; weighed?: boolean; packed?: boolean }) =>
    send<CategoryItem>('PUT', `/api/category_items/${categoryId}/${itemId}`, body),
  unlinkCategoryItem: (categoryId: number, itemId: number) =>
    send<{ ok: true }>('DELETE', `/api/category_items/${categoryId}/${itemId}`),

  reorderCategories: (listId: number, categoryIds: number[]) =>
    send<{ ok: true }>('PUT', `/api/lists/${listId}/category-order`, { categoryIds }),
  reorderItems: (categoryId: number, itemIds: number[]) =>
    send<{ ok: true }>('PUT', `/api/categories/${categoryId}/item-order`, { itemIds }),
  cloneList: (id: number, body: { name?: string } = {}) =>
    send<ListSummary>('POST', `/api/lists/${id}/clone`, body),
  deleteList: (id: number) =>
    send<{ ok: true }>('DELETE', `/api/lists/${id}`),
  setListArchived: (id: number, archived: boolean) =>
    send<ListSummary>('PUT', `/api/lists/${id}/archived`, { archived }),

  itemsAll: () => get<ItemWithUsage[]>('/api/items/all'),
  itemUsage: (id: number) => get<ItemUsage[]>(`/api/items/${id}/usage`),
  deleteItem: (id: number) => send<{ ok: true }>('DELETE', `/api/items/${id}`),

  fetchToBuy: () => get<Array<{ item: Item; neededQty: number }>>('/api/to-buy'),
  acquireFromToBuy: (itemId: number) =>
    send<{ itemsAffected: number; categoryItemsAffected: number }>('POST', '/api/to-buy/acquire', { itemId }),
};
