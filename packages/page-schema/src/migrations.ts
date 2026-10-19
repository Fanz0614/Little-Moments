import { CURRENT_SCHEMA_VERSION, PageDocumentSchema, type PageDocument } from './schema';

/**
 * Pages are kept for years, so every stored document carries schemaVersion and
 * is migrated on read. To change the schema:
 *   1. bump CURRENT_SCHEMA_VERSION and change PageDocumentSchema
 *   2. add `migrations[oldVersion] = (doc) => docAtOldVersionPlusOne`
 *   3. add a fixture of the old shape to test/migrations.test.ts
 * Never edit an existing migration once it has shipped.
 */
type RawDoc = Record<string, unknown> & { schemaVersion?: unknown };
type Migration = (doc: RawDoc) => RawDoc;

export const migrations: Record<number, Migration> = {
  // v1 is the first version. Example for the future:
  // 1: (doc) => ({ ...doc, schemaVersion: 2, background: { ...doc.background, texture: null } }),
};

export class PageMigrationError extends Error {
  constructor(
    message: string,
    readonly fromVersion: unknown,
  ) {
    super(message);
    this.name = 'PageMigrationError';
  }
}

export function migratePage(input: unknown): PageDocument {
  if (typeof input !== 'object' || input === null) {
    throw new PageMigrationError('page is not an object', undefined);
  }
  let doc = input as RawDoc;
  const from = doc.schemaVersion;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
    throw new PageMigrationError(`invalid schemaVersion: ${String(from)}`, from);
  }
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new PageMigrationError(
      `page was written by a newer app (v${from}, this app understands v${CURRENT_SCHEMA_VERSION})`,
      from,
    );
  }
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) throw new PageMigrationError(`no migration from v${v}`, from);
    doc = step(doc);
  }
  return PageDocumentSchema.parse(doc);
}

/** Parse a JSON string from storage into a current-version document. */
export function parseStoredPage(json: string): PageDocument {
  return migratePage(JSON.parse(json));
}
