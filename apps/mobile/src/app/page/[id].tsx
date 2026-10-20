import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import {
  addLayer,
  bringToFront,
  removeLayer,
  transformLayer,
  updateLayer,
  type Layer,
  type LayerTransform,
  type PageDocument,
  type TextLayer,
} from '@lm/page-schema';
import { formatJournalDate, layoutPage, type StickerDef } from '@lm/layout-engine';
import { loadPage, setPageThumb } from '@/db/repo';
import { getBaby } from '@/db/babies';
import { ageText } from '@/baby/derive';
import { logEvent } from '@/db/events';
import { deleteIfExists } from '@/photos/files';
import { EditorCanvas } from '@/editor/EditorCanvas';
import { StickerPicker } from '@/editor/StickerPicker';
import { TextEditSheet, type TextEdit } from '@/editor/TextEditSheet';
import { useEditor } from '@/editor/useEditor';
import { exportPdf, exportPng, share, writePageThumb, type ExportTiming } from '@/render/export';
import { skiaMeasureText } from '@/render/text';
import { usePhotoImages } from '@/render/useImages';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { S } from '@/strings';

export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<{ doc: PageDocument; birthday: string | null } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const page = await loadPage(db, id);
      if (!page) return setLoaded(null);
      const baby = page.babyId ? await getBaby(db, page.babyId) : null;
      setLoaded({ doc: page.doc, birthday: baby?.birthday ?? null });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, id]);

  if (error) return <Centered text={S.editor.openFailed(error)} />;
  if (loaded === undefined) return <Centered spinner />;
  if (loaded === null) return <Centered text={S.editor.notFound} />;
  return <Editor initial={loaded.doc} birthday={loaded.birthday} />;
}

function Centered({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={styles.centered}>
      {spinner ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.muted}>{text}</Text>}
    </View>
  );
}

/** `birthday` of the page's baby, used to put the age in the heading when re-laying out. */
function Editor({ initial, birthday }: { initial: PageDocument; birthday: string | null }) {
  const db = useSQLiteContext();
  const { doc, apply, undo, canUndo, flush, saveError } = useEditor(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [editingText, setEditingText] = useState<TextLayer | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const photoIds = useMemo(() => doc.layers.flatMap((l) => (l.type === 'photo' ? [l.photoId] : [])), [doc.layers]);
  const { images, loading } = usePhotoImages(photoIds);
  const selected = doc.layers.find((l) => l.id === selectedId) ?? null;

  // Keep the home-grid thumbnail current, a moment after edits settle.
  const thumbRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      try {
        const rel = await writePageThumb(doc, images);
        await setPageThumb(db, doc.id, rel);
        const previous = thumbRef.current;
        thumbRef.current = rel;
        if (previous && previous !== rel) deleteIfExists(previous);
      } catch (e) {
        console.warn('thumbnail failed', e);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [db, doc, images, loading]);

  const onCommit = useCallback(
    (layerId: string, t: LayerTransform) => apply((d) => updateLayer(d, layerId, (l) => transformLayer(l, t), Date.now())),
    [apply],
  );

  const center = (w: number, h: number) => ({
    x: doc.size.width / 2 - w / 2,
    y: doc.size.height / 2 - h / 2,
    width: w,
    height: h,
    rotation: 0,
  });

  const addText = () => {
    const layer: TextLayer = {
      id: randomUUID(),
      type: 'text',
      text: S.editor.newTextDefault,
      frame: center(300, 60),
      style: { role: 'hand', fontSize: 18, color: colors.ink, align: 'center', bold: false, lineHeight: 1.5 },
      source: 'user',
    };
    apply((d) => addLayer(d, layer, Date.now()));
    setSelectedId(layer.id);
    setEditingText(layer);
  };

  const addSticker = (def: StickerDef) => {
    setStickersOpen(false);
    const isTape = def.id === 'tape';
    const layer: Layer = {
      id: randomUUID(),
      type: 'sticker',
      stickerId: def.id,
      frame: center(isTape ? 96 : 56, isTape ? 28 : 56),
      color: def.defaultColor,
    };
    apply((d) => addLayer(d, layer, Date.now()));
    setSelectedId(layer.id);
  };

  const saveText = (edit: TextEdit) => {
    if (!editingText) return;
    const targetId = editingText.id;
    setEditingText(null);
    apply((d) =>
      updateLayer(
        d,
        targetId,
        (l) => {
          if (l.type !== 'text') return l;
          // Re-measure so the box grows/shrinks with the new text.
          const height = Math.ceil(skiaMeasureText(edit.text, edit.style, l.frame.width));
          return { ...l, text: edit.text, style: edit.style, frame: { ...l.frame, height: Math.max(20, height) } };
        },
        Date.now(),
      ),
    );
  };

  const relayout = () => {
    const run = () => {
      const photos = doc.layers.flatMap((l) => {
        if (l.type !== 'photo') return [];
        const row = images.get(l.photoId)?.row;
        return row ? [{ id: row.id, width: row.width, height: row.height }] : [];
      });
      const caption = doc.layers.find((l): l is TextLayer => l.type === 'text' && l.source === 'user')?.text ?? '';
      try {
        const probe = layoutPage(
          { pageId: doc.id, journalDate: doc.journalDate, photos, caption, now: Date.now(), newId: randomUUID },
          skiaMeasureText,
        );
        const order = probe.ranked.map((r) => r.templateId);
        const next = order[(order.indexOf(doc.templateId) + 1) % order.length]!;
        const { doc: fresh } = layoutPage(
          {
            pageId: doc.id,
            journalDate: doc.journalDate,
            photos,
            caption,
            ageText: birthday ? ageText(birthday, doc.journalDate) : undefined,
            templateId: next,
            now: Date.now(),
            createdAt: doc.createdAt,
            newId: randomUUID,
          },
          skiaMeasureText,
        );
        apply(() => fresh);
        setSelectedId(null);
        void logEvent(db, 'relayout', doc.id, { templateId: next });
      } catch (e) {
        Alert.alert(S.editor.shuffleFailed, e instanceof Error ? e.message : String(e));
      }
    };
    Alert.alert(S.editor.shuffleTitle, S.editor.shuffleBody, [
      { text: S.common.cancel, style: 'cancel' },
      { text: S.editor.shuffleConfirm, onPress: run },
    ]);
  };

  const doExport = async (format: 'pdf' | 'png') => {
    setSelectedId(null);
    setBusy(format === 'pdf' ? S.editor.exportingPdf : S.editor.exportingPng);
    try {
      await flush();
      const { uri, timing } = format === 'pdf' ? await exportPdf(doc, images) : await exportPng(doc, images);
      setNotice(describeTiming(format, timing));
      await logEvent(db, 'page_exported', doc.id, { format, ...timing });
      setBusy(null);
      await share(uri, format === 'pdf' ? 'application/pdf' : 'image/png');
    } catch (e) {
      setBusy(null);
      Alert.alert(S.editor.exportFailed, e instanceof Error ? e.message : String(e));
    }
  };

  const chooseExport = () =>
    Alert.alert(S.editor.exportTitle, S.editor.exportBody, [
      { text: S.editor.exportPdf, onPress: () => void doExport('pdf') },
      { text: S.editor.exportPng, onPress: () => void doExport('png') },
      { text: S.common.cancel, style: 'cancel' },
    ]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width, h: height });
  };

  const pageWidth = area ? Math.min(area.w - 32, (area.h - 24) * (doc.size.width / doc.size.height)) : 0;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: formatJournalDate(doc.journalDate, 'en'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={S.editor.undo} variant="ghost" compact onPress={undo} disabled={!canUndo} />
              <Button title={S.editor.export} compact onPress={chooseExport} disabled={loading || !!busy} />
            </View>
          ),
        }}
      />

      <View style={styles.canvasArea} onLayout={onLayout}>
        {area && pageWidth > 0 && (
          <View style={styles.pageShadow}>
            <EditorCanvas
              doc={doc}
              images={images}
              width={pageWidth}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCommit={onCommit}
            />
          </View>
        )}
        {loading && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </View>

      {(saveError || notice) && (
        <Text style={[styles.notice, saveError && { color: colors.danger }]} onPress={() => setNotice(null)}>
          {saveError ? S.editor.saveFailed(saveError) : notice}
        </Text>
      )}

      <ScrollView horizontal style={styles.toolbarScroll} contentContainerStyle={styles.toolbar} keyboardShouldPersistTaps="handled">
        {selected ? (
          <>
            {selected.type === 'text' && <Button title={S.editor.editText} compact onPress={() => setEditingText(selected)} />}
            <Button title={S.editor.bringToFront} variant="secondary" compact onPress={() => apply((d) => bringToFront(d, selected.id, Date.now()))} />
            <Button
              title={S.common.delete}
              variant="danger"
              compact
              onPress={() => {
                apply((d) => removeLayer(d, selected.id, Date.now()));
                setSelectedId(null);
              }}
            />
            <Button title={S.common.done} variant="ghost" compact onPress={() => setSelectedId(null)} />
          </>
        ) : (
          <>
            <Button title={S.editor.addText} variant="secondary" compact onPress={addText} />
            <Button title={S.editor.addSticker} variant="secondary" compact onPress={() => setStickersOpen(true)} />
            <Button title={S.editor.shuffle} variant="secondary" compact onPress={relayout} disabled={loading} />
          </>
        )}
      </ScrollView>
      <Text style={styles.tip}>{selected ? S.editor.tipSelected : S.editor.tipIdle}</Text>

      <TextEditSheet layer={editingText} onClose={() => setEditingText(null)} onSave={saveText} />
      <StickerPicker visible={stickersOpen} onClose={() => setStickersOpen(false)} onPick={addSticker} />

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      )}
    </View>
  );
}

function describeTiming(format: string, t: ExportTiming): string {
  const mb = (t.bytes / 1024 / 1024).toFixed(1);
  return S.editor.timing(format.toUpperCase(), t.width, t.height, t.renderMs, t.encodeMs, mb);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.paper },
  muted: { color: colors.softInk, textAlign: 'center' },
  canvasArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageShadow: {
    shadowColor: '#3C2814',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    backgroundColor: '#FFFFFF',
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  notice: { textAlign: 'center', fontSize: 12, color: colors.softInk, paddingHorizontal: 16, paddingBottom: 4 },
  toolbarScroll: { flexGrow: 0 },
  toolbar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tip: { textAlign: 'center', fontSize: 12, color: colors.faint, paddingBottom: 18 },
  busy: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(40, 30, 20, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: { color: '#FFFFFF', fontSize: 15 },
});
