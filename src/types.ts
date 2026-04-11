export type Settings = {
  version: string | null;
  totalUnit: string;
  itemUnit: string;
  currencySymbol: string;
  defaultListId: number | null;
  optionalFields: Record<string, boolean> | null;
};

export type ListSummary = {
  id: number;
  name: string;
  description: string;
  externalId: string;
  position: number;
  archived: boolean;
};

export type Priority = 'Critical' | 'Contingent' | 'Suggested' | 'Optional' | 'Unnecessary';

export type CategoryItem = {
  itemId: number;
  name: string;
  description: string;
  weight: number; // milligrams
  authorUnit: 'g' | 'kg' | 'oz' | 'lb' | string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  qty: number;
  worn: boolean;
  consumable: boolean;
  star: number;
  position: number;
  priority?: Priority | null;
};

export type Category = {
  id: number;
  name: string;
  color: { r: number; g: number; b: number } | null;
  position: number;
  items: CategoryItem[];
};

export type ListDetail = ListSummary & {
  categories: Category[];
};

export type TemplateSummary = {
  id: number;
  slug: string;
  name: string;
  source: string | null;
  categoryCount: number;
  itemCount: number;
};

export type TemplateItem = {
  id: number;
  name: string;
  priority: Priority | string;
  description: string;
  example: string;
  moreInfo: string;
  position: number;
};

export type ItemUsage = {
  listId: number;
  listName: string;
  categoryId: number;
  categoryName: string;
  qty: number;
  worn: boolean;
  consumable: boolean;
};

export type ItemWithUsage = Item & { usedIn: number };

export type Item = {
  id: number;
  name: string;
  description: string;
  weight: number;
  authorUnit: string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
};

export type Template = {
  id: number;
  slug: string;
  name: string;
  source: string | null;
  categories: Array<{
    id: number;
    name: string;
    position: number;
    items: TemplateItem[];
  }>;
};
