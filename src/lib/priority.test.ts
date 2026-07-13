import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryItemPriority,
  DEFAULT_CATEGORY_ITEM_PRIORITY,
  isDefaultTemplateSelection,
} from './priority';

test('manual category links default to Suggested', () => {
  assert.equal(DEFAULT_CATEGORY_ITEM_PRIORITY, 'Suggested');
  assert.equal(categoryItemPriority(undefined), 'Suggested');
  assert.equal(categoryItemPriority('not-a-priority'), 'Suggested');
});

test('explicit valid priorities are preserved', () => {
  assert.equal(categoryItemPriority('Critical'), 'Critical');
  assert.equal(categoryItemPriority('Contingent'), 'Contingent');
  assert.equal(categoryItemPriority('Optional'), 'Optional');
});

test('template defaults include required and recommended gear, not contingent gear', () => {
  assert.equal(isDefaultTemplateSelection('Critical'), true);
  assert.equal(isDefaultTemplateSelection('Suggested'), true);
  assert.equal(isDefaultTemplateSelection('Contingent'), false);
  assert.equal(isDefaultTemplateSelection('Optional'), false);
});
