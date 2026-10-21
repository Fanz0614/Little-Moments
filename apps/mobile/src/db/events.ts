import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local-only product metrics. Nothing leaves the device. These exist to check
 * the Phase 1 hypothesis "a page takes under 3 minutes" with real numbers.
 *
 *   flow_started   user opened "New page"            data: { flowId }
 *   page_created   layout generated and saved        data: { flowId, photoCount, templateId }
 *   page_exported  PNG/PDF shared                    data: { format }
 *   relayout       user tapped Shuffle layout              data: { templateId }
 *
 * AI caption assist (step 4). Text is stored only in ai_caption_saved, locally,
 * so the edit distance at first export can be computed; nothing is uploaded.
 *   ai_requested         tapped Help me write / Try again   data: { flowId, requestId }
 *   ai_result            response arrived                     data: { flowId, requestId, kind, reason?, warnings, latencyMs }
 *   ai_accepted          tapped Use this                      data: { flowId, requestId }
 *   ai_kept_mine         tapped Keep mine                     data: { flowId, requestId }
 *   ai_undo              undid an accepted suggestion         data: { flowId }
 *   ai_caption_saved     page created with an AI caption      data: { flowId, requestId, aiCaption }
 *   ai_caption_exported  first export of such a page          data: { distance, ratio, aiLength, finalLength, removed }
 */
export type EventName =
  | 'flow_started'
  | 'page_created'
  | 'page_exported'
  | 'relayout'
  | 'ai_requested'
  | 'ai_result'
  | 'ai_accepted'
  | 'ai_kept_mine'
  | 'ai_undo'
  | 'ai_caption_saved'
  | 'ai_caption_exported';

export async function logEvent(
  db: SQLiteDatabase,
  name: EventName,
  pageId: string | null,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.runAsync(
      'INSERT INTO events (name, page_id, ts, data) VALUES (?, ?, ?, ?)',
      name,
      pageId,
      Date.now(),
      data ? JSON.stringify(data) : null,
    );
  } catch (e) {
    // Metrics must never break the product flow.
    console.warn('logEvent failed', e);
  }
}

export type CreationStats = {
  /** Pages that have both a flow start and a first export. */
  measuredPages: number;
  /** Median ms from opening "New page" to the page's first export. */
  medianMs: number | null;
};

/**
 * Time-to-first-export per page: flow_started (matched by flowId) -> first
 * page_exported for the page that flow created.
 */
export async function creationStats(db: SQLiteDatabase): Promise<CreationStats> {
  const rows = await db.getAllAsync<{ ms: number }>(`
    WITH created AS (
      SELECT page_id, json_extract(data, '$.flowId') AS flow_id FROM events WHERE name = 'page_created'
    ),
    started AS (
      SELECT json_extract(data, '$.flowId') AS flow_id, MIN(ts) AS ts FROM events WHERE name = 'flow_started' GROUP BY flow_id
    ),
    exported AS (
      SELECT page_id, MIN(ts) AS ts FROM events WHERE name = 'page_exported' GROUP BY page_id
    )
    SELECT exported.ts - started.ts AS ms
    FROM created
    JOIN started ON started.flow_id = created.flow_id
    JOIN exported ON exported.page_id = created.page_id
    ORDER BY ms
  `);
  if (rows.length === 0) return { measuredPages: 0, medianMs: null };
  const mid = Math.floor(rows.length / 2);
  const median = rows.length % 2 ? rows[mid]!.ms : (rows[mid - 1]!.ms + rows[mid]!.ms) / 2;
  return { measuredPages: rows.length, medianMs: median };
}
