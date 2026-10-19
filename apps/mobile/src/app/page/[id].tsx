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

export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [doc, setDoc] = useState<PageDocument | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPage(db, id)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, id]);

  if (error) return <Centered text={`无法打开这一页：${error}`} />;
  if (doc === undefined) return <Centered spinner />;
  if (doc === null) return <Centered text="这一页不存在或已被删除" />;
  return <Editor initial={doc} />;
}

function Centered({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={styles.centered}>
      {spinner ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.muted}>{text}</Text>}
    </View>
  );
}

function Editor({ initial }: { initial: PageDocument }) {
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
      text: '写点什么',
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
        Alert.alert('换排版失败', e instanceof Error ? e.message : String(e));
      }
    };
    Alert.alert('换个排版？', '照片和文字会按新模板重新摆放，手动调整会被覆盖（可以撤销）。', [
      { text: '取消', style: 'cancel' },
      { text: '换', onPress: run },
    ]);
  };

  const doExport = async (format: 'pdf' | 'png') => {
    setSelectedId(null);
    setBusy(format === 'pdf' ? '正在生成 PDF…' : '正在生成图片…');
    try {
      await flush();
      const { uri, timing } = format === 'pdf' ? await exportPdf(doc, images) : await exportPng(doc, images);
      setNotice(describeTiming(format, timing));
      await logEvent(db, 'page_exported', doc.id, { format, ...timing });
      setBusy(null);
      await share(uri, format === 'pdf' ? 'application/pdf' : 'image/png');
    } catch (e) {
      setBusy(null);
      Alert.alert('导出失败', e instanceof Error ? e.message : String(e));
    }
  };

  const chooseExport = () =>
    Alert.alert('导出', '高清 300 dpi，A4', [
      { text: 'PDF（可导入 Goodnotes）', onPress: () => void doExport('pdf') },
      { text: 'PNG 图片', onPress: () => void doExport('png') },
      { text: '取消', style: 'cancel' },
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
          title: formatJournalDate(doc.journalDate, 'zh'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="撤销" variant="ghost" compact onPress={undo} disabled={!canUndo} />
              <Button title="导出" compact onPress={chooseExport} disabled={loading || !!busy} />
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
          {saveError ? `保存失败：${saveError}` : notice}
        </Text>
      )}

      <ScrollView horizontal style={styles.toolbarScroll} contentContainerStyle={styles.toolbar} keyboardShouldPersistTaps="handled">
        {selected ? (
          <>
            {selected.type === 'text' && <Button title="编辑文字" compact onPress={() => setEditingText(selected)} />}
            <Button title="置顶" variant="secondary" compact onPress={() => apply((d) => bringToFront(d, selected.id, Date.now()))} />
            <Button
              title="删除"
              variant="danger"
              compact
              onPress={() => {
                apply((d) => removeLayer(d, selected.id, Date.now()));
                setSelectedId(null);
              }}
            />
            <Button title="完成" variant="ghost" compact onPress={() => setSelectedId(null)} />
          </>
        ) : (
          <>
            <Button title="＋文字" variant="secondary" compact onPress={addText} />
            <Button title="＋贴纸" variant="secondary" compact onPress={() => setStickersOpen(true)} />
            <Button title="换个排版" variant="secondary" compact onPress={relayout} disabled={loading} />
          </>
        )}
      </ScrollView>
      <Text style={styles.tip}>{selected ? '拖动移动 · 双指缩放和旋转' : '点一下照片、文字或贴纸来调整'}</Text>

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
  return `${format.toUpperCase()} ${t.width}×${t.height} · 渲染 ${t.renderMs} ms · 编码 ${t.encodeMs} ms · ${mb} MB`;
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
