import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { SUPPORTED_PHOTO_COUNTS, layoutPage } from '@lm/layout-engine';
import { type PhotoRow, savePage } from '@/db/repo';
import { logEvent } from '@/db/events';
import { MAX_PICK, importAssets, pickPhotos, suggestJournalDate, type ImportProgress } from '@/photos/import';
import { docUri } from '@/photos/files';
import { skiaMeasureText } from '@/render/text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { S } from '@/strings';
import { useBaby } from '@/baby/BabyContext';
import { ageText, isValidCalendarDate } from '@/baby/derive';

const MIN = Math.min(...SUPPORTED_PHOTO_COUNTS);
const MAX = Math.max(...SUPPORTED_PHOTO_COUNTS);

export default function NewPage() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const { baby } = useBaby();
  const [flowId] = useState(() => randomUUID());
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [journalDate, setJournalDate] = useState('');
  const [caption, setCaption] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void logEvent(db, 'flow_started', null, { flowId });
  }, [db, flowId]);

  const addPhotos = async () => {
    const room = MAX_PICK - photos.length;
    if (room <= 0) return;
    const assets = await pickPhotos();
    if (!assets || assets.length === 0) return;
    setProgress({ done: 0, total: Math.min(assets.length, room) });
    try {
      const rows = await importAssets(db, assets.slice(0, room), setProgress);
      const all = [...photos, ...rows];
      setPhotos(all);
      // If the user picked a usable number, select them all: one less step.
      setSelected((prev) => {
        if (prev.length > 0) return prev;
        return all.length >= MIN && all.length <= MAX ? all.map((p) => p.id) : [];
      });
      if (!journalDate) setJournalDate(suggestJournalDate(all));
    } catch (e) {
      Alert.alert(S.newPage.importFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));
  };

  const dateValid = isValidCalendarDate(journalDate);
  const canCreate = selected.length >= MIN && selected.length <= MAX && dateValid && !creating;

  const create = async () => {
    setCreating(true);
    try {
      const byId = new Map(photos.map((p) => [p.id, p]));
      const chosen = selected.map((id) => byId.get(id)!).filter(Boolean);
      const pageId = randomUUID();
      const { doc } = layoutPage(
        {
          pageId,
          journalDate,
          photos: chosen.map((p) => ({ id: p.id, width: p.width, height: p.height })),
          caption,
          ageText: baby ? ageText(baby.birthday, journalDate) : undefined,
          now: Date.now(),
          newId: randomUUID,
        },
        skiaMeasureText,
      );
      await savePage(db, doc, { babyId: baby?.id ?? null });
      await logEvent(db, 'page_created', pageId, { flowId, photoCount: chosen.length, templateId: doc.templateId });
      router.replace(`/page/${pageId}`);
    } catch (e) {
      setCreating(false);
      Alert.alert(S.newPage.createFailed, e instanceof Error ? e.message : String(e));
    }
  };

  const cols = width >= 700 ? 5 : 3;
  const tile = (width - 20 * 2 - 8 * (cols - 1)) / cols;
  // One or two words gives the AI nothing to work with, and it is told not to invent detail.
  const wordCount = caption.trim().split(/\s+/).filter(Boolean).length;
  const showNudge = wordCount > 0 && wordCount < 3;

  const hint = useMemo(() => {
    if (photos.length === 0) return S.newPage.hintEmpty(MIN, MAX, MAX_PICK);
    if (selected.length < MIN) return S.newPage.hintMore(MIN - selected.length);
    return S.newPage.hintSelected(selected.length);
  }, [photos.length, selected.length]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.step}>{S.newPage.stepPhotos}</Text>
        <Text style={styles.hint}>{hint}</Text>

        <View style={styles.grid}>
          {photos.map((p) => {
            const order = selected.indexOf(p.id);
            return (
              <Pressable key={p.id} onPress={() => toggle(p.id)} style={{ width: tile, height: tile }}>
                <Image source={{ uri: docUri(p.thumbPath) }} style={[styles.tileImg, order < 0 && selected.length > 0 && styles.dim]} />
                {order >= 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{order + 1}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
          {photos.length < MAX_PICK && (
            <Pressable onPress={addPhotos} disabled={!!progress} style={[styles.addTile, { width: tile, height: tile }]}>
              {progress ? (
                <>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.addText}>
                    {progress.done}/{progress.total}
                  </Text>
                </>
              ) : (
                <Text style={styles.addPlus}>+</Text>
              )}
            </Pressable>
          )}
        </View>

        <Text style={[styles.step, { marginTop: 28 }]}>{S.newPage.stepCaption}</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder={S.newPage.captionPlaceholder}
          placeholderTextColor={colors.faint}
          multiline
          // Same limit as the caption API's note (LIMITS.note in @lm/ai-contracts).
          maxLength={300}
          style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
        />
        {showNudge && <Text style={styles.small}>{S.newPage.captionNudge}</Text>}

        <Text style={[styles.step, { marginTop: 20 }]}>{S.newPage.date}</Text>
        <TextInput
          value={journalDate}
          onChangeText={setJournalDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          style={[styles.input, !dateValid && journalDate.length > 0 && { borderColor: colors.danger }]}
        />
        <Text style={styles.small}>{S.newPage.dateHint}</Text>

        <Button title={S.newPage.create} onPress={create} disabled={!canCreate} loading={creating} style={{ marginTop: 28 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 48 },
  step: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { marginTop: 6, marginBottom: 12, fontSize: 13, color: colors.softInk },
  small: { marginTop: 6, fontSize: 12, color: colors.faint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tileImg: { width: '100%', height: '100%', borderRadius: radius.sm, backgroundColor: colors.line },
  dim: { opacity: 0.4 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  addTile: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPlus: { fontSize: 30, color: colors.faint },
  addText: { fontSize: 12, color: colors.softInk },
  input: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
});
