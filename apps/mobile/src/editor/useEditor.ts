import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { PageDocument } from '@lm/page-schema';
import { savePage } from '@/db/repo';

const MAX_UNDO = 40;
const SAVE_DEBOUNCE_MS = 600;

/**
 * Document state for the editor: every change goes through `apply`, which
 * records undo history and schedules a debounced save. The current doc lives
 * in a ref so consecutive edits in one tick compose correctly and no side
 * effects run inside React state updaters.
 */
export function useEditor(initial: PageDocument) {
  const db = useSQLiteContext();
  const [doc, setDoc] = useState(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const current = useRef(initial);
  const history = useRef<PageDocument[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    try {
      await savePage(db, current.current);
      setSaveError(null);
    } catch (e) {
      dirty.current = true;
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [db]);

  const commit = useCallback(
    (next: PageDocument) => {
      current.current = next;
      setDoc(next);
      setCanUndo(history.current.length > 0);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const apply = useCallback(
    (fn: (d: PageDocument) => PageDocument) => {
      const prev = current.current;
      const next = fn(prev);
      if (next === prev) return;
      history.current = [...history.current.slice(-(MAX_UNDO - 1)), prev];
      commit(next);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = history.current.at(-1);
    if (!prev) return;
    history.current = history.current.slice(0, -1);
    commit({ ...prev, updatedAt: Date.now() });
  }, [commit]);

  // Save whatever is pending when the screen goes away.
  useEffect(() => () => void flush(), [flush]);

  return { doc, apply, undo, canUndo, flush, saveError, current };
}
