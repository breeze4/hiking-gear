// Hand-authored OpenAPI 3 document for the hiking-gear API.
//
// Source of truth: the `app.get/post/put/delete('/api/...')` registrations in
// `server/index.ts`. Every path/method/param/body below was verified against
// that file. Keep this in sync when API routes change.
//
// Served at GET /openapi.json; rendered by Swagger UI at GET /docs.

const Error = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
} as const;

const Ok = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
} as const;

const ListSummary = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    description: { type: 'string' },
    externalId: { type: 'string', description: 'LighterPack import id (may be empty).' },
    position: { type: 'integer' },
    archived: { type: 'boolean' },
  },
} as const;

const Item = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    description: { type: 'string' },
    weight: { type: 'number', description: 'Raw stored numeric weight; display unit is `authorUnit`.' },
    authorUnit: { type: 'string', example: 'oz' },
    price: { type: 'number' },
    image: { type: 'string' },
    imageUrl: { type: 'string' },
    url: { type: 'string' },
    singleton: { type: 'boolean', description: 'A unique physical item (one copy owned).' },
    acquired: { type: 'boolean' },
    weighed: { type: 'boolean' },
  },
} as const;

const CategoryItem = {
  type: 'object',
  description: 'An item as it appears within a list category, with prep status rolled up.',
  properties: {
    itemId: { type: 'integer' },
    name: { type: 'string' },
    description: { type: 'string' },
    weight: { type: 'number' },
    authorUnit: { type: 'string' },
    price: { type: 'number' },
    image: { type: 'string' },
    imageUrl: { type: 'string' },
    url: { type: 'string' },
    singleton: { type: 'boolean' },
    qty: { type: 'integer' },
    worn: { type: 'boolean' },
    consumable: { type: 'boolean' },
    star: { type: 'integer' },
    position: { type: 'integer' },
    priority: { type: 'string', nullable: true },
    itemAcquired: { type: 'boolean' },
    itemWeighed: { type: 'boolean' },
    ciAcquired: { type: 'boolean' },
    ciWeighed: { type: 'boolean' },
    packed: { type: 'boolean' },
    effective: { type: 'object', description: 'Resolved acquired/weighed/packed status.' },
    writeTarget: { type: 'string', description: 'Where a prep-status write lands: item vs category_item.' },
  },
} as const;

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
} as const;

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Hiking Gear API',
    version: '0.3',
    description:
      'Personal backpacking gear inventory and pack-list tracker (Hono + better-sqlite3). ' +
      'All endpoints live under `/api`; everything else is served the React SPA. No authentication (LAN only).',
  },
  servers: [{ url: '/', description: 'On-box service (port 8002).' }],
  tags: [
    { name: 'Utility' },
    { name: 'Lists' },
    { name: 'Categories' },
    { name: 'Items' },
    { name: 'CategoryItems' },
    { name: 'Templates' },
    { name: 'ToBuy' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Utility'],
        summary: 'Liveness check.',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
              },
            },
          },
        },
      },
    },
    '/api/settings': {
      get: {
        tags: ['Utility'],
        summary: 'App-wide settings.',
        description: 'Units, currency symbol, default list id, and optional field visibility flags.',
        responses: { '200': { description: 'Settings object' } },
      },
    },
    '/api/lists': {
      get: {
        tags: ['Lists'],
        summary: 'List all pack lists.',
        parameters: [
          {
            name: 'includeArchived',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['true'] },
            description: 'Pass `true` to include archived lists; otherwise only non-archived.',
          },
        ],
        responses: {
          '200': {
            description: 'Array of list summaries, ordered by position.',
            content: { 'application/json': { schema: { type: 'array', items: ListSummary } } },
          },
        },
      },
      post: {
        tags: ['Lists'],
        summary: 'Create a list.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' }, description: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Created list row', content: { 'application/json': { schema: ListSummary } } },
          '400': { description: 'name is required / invalid json', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/lists/from-template': {
      post: {
        tags: ['Lists'],
        summary: 'Create a list from a template.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slug', 'name', 'itemIds'],
                properties: {
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  itemIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Subset of template item ids to include.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'New list id + name',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
              },
            },
          },
          '400': { description: 'Missing/invalid field or unknown slug', content: { 'application/json': { schema: Error } } },
          '500': { description: 'Insert failed', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/lists/{id}': {
      get: {
        tags: ['Lists'],
        summary: 'Full list detail with categories and items.',
        parameters: [idParam],
        responses: {
          '200': { description: 'List detail (metadata + categories[].items[] with prep status).' },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
      put: {
        tags: ['Lists'],
        summary: 'Update list name and/or description.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Updated list row' },
          '400': { description: 'invalid id / invalid json', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
      delete: {
        tags: ['Lists'],
        summary: 'Delete a list and its categories/category_items (cascade).',
        parameters: [idParam],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'invalid id', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/lists/{id}/archived': {
      put: {
        tags: ['Lists'],
        summary: 'Archive or unarchive a list.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['archived'], properties: { archived: { type: 'boolean' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Updated list row' },
          '400': { description: 'archived (boolean) required', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/lists/{id}/clone': {
      post: {
        tags: ['Lists'],
        summary: 'Clone a list (categories + items; prep flags reset).',
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string', description: 'Defaults to "Copy of <name>".' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'New list summary', content: { 'application/json': { schema: ListSummary } } },
          '400': { description: 'invalid id', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/lists/{id}/category-order': {
      put: {
        tags: ['Lists'],
        summary: 'Reorder categories within a list.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['categoryIds'],
                properties: {
                  categoryIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Complete set of the list’s category ids in the new order.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Reordered', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'categoryIds must match list categories', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/categories': {
      post: {
        tags: ['Categories'],
        summary: 'Create a category in a list.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['listId'],
                properties: { listId: { type: 'integer' }, name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Created category',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    listId: { type: 'integer' },
                    name: { type: 'string' },
                    position: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { description: 'listId required', content: { 'application/json': { schema: Error } } },
          '404': { description: 'list not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/categories/{id}': {
      put: {
        tags: ['Categories'],
        summary: 'Update category name.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        },
        responses: {
          '200': { description: 'Updated category row' },
          '400': { description: 'invalid id / invalid json', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete a category.',
        parameters: [idParam],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'invalid id', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/categories/{id}/item-order': {
      put: {
        tags: ['Categories'],
        summary: 'Reorder items within a category.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['itemIds'],
                properties: {
                  itemIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Complete set of the category’s item ids in the new order.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Reordered', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'itemIds must match category items', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/items': {
      get: {
        tags: ['Items'],
        summary: 'Search/list gear items (max 50).',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Case-insensitive name LIKE search; omit for the first 50 by name.',
          },
        ],
        responses: {
          '200': {
            description: 'Array of items',
            content: { 'application/json': { schema: { type: 'array', items: Item } } },
          },
        },
      },
      post: {
        tags: ['Items'],
        summary: 'Create a gear item.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  weight: { type: 'number' },
                  authorUnit: { type: 'string', default: 'oz' },
                  price: { type: 'number' },
                  url: { type: 'string' },
                  imageUrl: { type: 'string' },
                  singleton: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Created item', content: { 'application/json': { schema: Item } } },
          '400': { description: 'invalid json', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/items/all': {
      get: {
        tags: ['Items'],
        summary: 'Full gear library (no limit), with usage count.',
        responses: {
          '200': {
            description: 'Array of items, each with `usedIn` (number of category_items referencing it).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    allOf: [Item, { type: 'object', properties: { usedIn: { type: 'integer' } } }],
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/items/{id}': {
      put: {
        tags: ['Items'],
        summary: 'Update item fields (any subset).',
        parameters: [idParam],
        requestBody: {
          required: true,
          description: 'Any subset of: name, description, weight, authorUnit, price, url, imageUrl, image, singleton, acquired, weighed.',
          content: { 'application/json': { schema: Item } },
        },
        responses: {
          '200': { description: 'Updated item', content: { 'application/json': { schema: Item } } },
          '400': { description: 'invalid id / weight|price must be a number', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
      delete: {
        tags: ['Items'],
        summary: 'Delete an item from the library.',
        parameters: [idParam],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'invalid id', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
          '409': {
            description: 'Item is referenced by one or more categories.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { error: { type: 'string' }, usedIn: { type: 'array', items: { type: 'object' } } },
                },
              },
            },
          },
        },
      },
    },
    '/api/items/{id}/usage': {
      get: {
        tags: ['Items'],
        summary: 'Lists and categories that reference this item.',
        parameters: [idParam],
        responses: {
          '200': { description: 'Array of {listId, listName, categoryId, categoryName, qty, worn, consumable}.' },
          '400': { description: 'invalid id', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/category_items': {
      post: {
        tags: ['CategoryItems'],
        summary: 'Link an item to a category.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['categoryId', 'itemId'],
                properties: {
                  categoryId: { type: 'integer' },
                  itemId: { type: 'integer' },
                  qty: { type: 'integer', default: 1 },
                  worn: { type: 'boolean' },
                  consumable: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Joined category-item row', content: { 'application/json': { schema: CategoryItem } } },
          '400': { description: 'categoryId and itemId required', content: { 'application/json': { schema: Error } } },
          '404': { description: 'category/item not found', content: { 'application/json': { schema: Error } } },
          '409': { description: 'item already linked to category', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/category_items/{categoryId}/{itemId}': {
      put: {
        tags: ['CategoryItems'],
        summary: 'Update per-list item attributes.',
        parameters: [
          { name: 'categoryId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          description: 'Any subset of: qty, worn, consumable, star, acquired, weighed, packed.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  qty: { type: 'integer' },
                  worn: { type: 'boolean' },
                  consumable: { type: 'boolean' },
                  star: { type: 'boolean' },
                  acquired: { type: 'boolean' },
                  weighed: { type: 'boolean' },
                  packed: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated joined row', content: { 'application/json': { schema: CategoryItem } } },
          '400': { description: 'invalid ids / qty must be a number', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
      delete: {
        tags: ['CategoryItems'],
        summary: 'Remove an item from a category.',
        parameters: [
          { name: 'categoryId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Removed', content: { 'application/json': { schema: Ok } } },
          '400': { description: 'invalid ids', content: { 'application/json': { schema: Error } } },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/templates': {
      get: {
        tags: ['Templates'],
        summary: 'List all templates.',
        responses: {
          '200': {
            description: 'Array of {id, slug, name, source, categoryCount, itemCount}.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      slug: { type: 'string' },
                      name: { type: 'string' },
                      source: { type: 'string', nullable: true },
                      categoryCount: { type: 'integer' },
                      itemCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/templates/{slug}': {
      get: {
        tags: ['Templates'],
        summary: 'Full template detail (categories with items).',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Template detail; item fields include priority, description, example, moreInfo.' },
          '404': { description: 'not found', content: { 'application/json': { schema: Error } } },
        },
      },
    },
    '/api/to-buy': {
      get: {
        tags: ['ToBuy'],
        summary: 'Items flagged as needed but not yet acquired.',
        responses: {
          '200': {
            description: 'Array of {item, neededQty}.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { item: Item, neededQty: { type: 'integer' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/to-buy/acquire': {
      post: {
        tags: ['ToBuy'],
        summary: 'Mark an item as acquired.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'integer' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Result of acquireItem.' },
          '400': { description: 'itemId required', content: { 'application/json': { schema: Error } } },
        },
      },
    },
  },
} as const;
