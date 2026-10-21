import type { SQLiteDatabase } from 'expo-sqlite';
import type { PageDocument, TextLayer } from '@lm/page-schema';
import { logEvent } from '@/db/events';
import { editDistance, editRatio } from './editDistance';

/**
 * On the first export of a page made with an AI caption, record how much the
 * user changed it. That is the quality signal prompt changes are judged by.
 */
export async function recordAiCaptionExport(db: SQLiteDatabase, doc: PageDocument): Promise<void> {
  try {
    const done = await db.getFirstAsync('SELECT 1 FROM events WHERE name = ? AND page_id = ? LIMIT 1', 'ai_caption_exported', doc.id);
    if (done) return;
    const saved = await db.getFirstAsync<{ data: string | null }>(
      'SELECT data FROM events WHERE name = ? AND page_id = ? ORDER BY ts DESC LIMIT 1',
      'ai_caption_saved',
      doc.id,
    );
    if (!saved?.data) return;
    const aiCaption = String((JSON.parse(saved.data) as { aiCaption?: unknown }).aiCaption ?? '');
    const layer = doc.layers.find((l): l is TextLayer => l.type === 'text' && l.source === 'ai-draft');
    const final = layer?.text ?? '';
    await logEvent(db, 'ai_caption_exported', doc.id, {
      distance: editDistance(aiCaption, final),
      ratio: layer ? editRatio(aiCaption, final) : 1,
      aiLength: [...aiCaption].length,
      finalLength: [...final].length,
      removed: !layer,
    });
  } catch (e) {
    console.warn('recordAiCaptionExport failed', e);
  }
}
