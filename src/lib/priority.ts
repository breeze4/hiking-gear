import type { Priority } from '../types';

export const PRIORITIES: Priority[] = ['Critical', 'Suggested', 'Contingent', 'Optional', 'Unnecessary'];

export const DEFAULT_CATEGORY_ITEM_PRIORITY: Priority = 'Suggested';

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && PRIORITIES.includes(value as Priority);
}

export function categoryItemPriority(value: unknown): Priority {
  return isPriority(value) ? value : DEFAULT_CATEGORY_ITEM_PRIORITY;
}

export function isDefaultTemplateSelection(priority: string): boolean {
  return priority === 'Critical' || priority === 'Suggested';
}
