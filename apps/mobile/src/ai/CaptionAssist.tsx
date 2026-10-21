import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import type { CaptionInput, CaptionOutput, Warning } from '@lm/ai-contracts';
import { logEvent } from '@/db/events';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { S } from '@/strings';
import { requestCaption, warningTerms } from './client';
import { getDeviceId } from './deviceId';
import { WRITING_PROMPTS } from './input';

export type AcceptedCaption = { requestId: string; output: CaptionOutput };

type Phase =
  | { k: 'idle' }
  | { k: 'loading'; requestId: string }
  | { k: 'preview'; requestId: string; output: CaptionOutput; warnings: Warning[] }
  | { k: 'unavailable' };

/**
 * Optional AI help under the note box. The user's own words are the default:
 * nothing here runs unless they tap "Help me write", and Create page never
 * waits for the AI. A suggestion is only applied when they tap "Use this".
 */
export function CaptionAssist({
  note,
  onPrompt,
  buildInput,
  flowId,
  accepted,
  showHelp,
  onUse,
  onUndo,
}: {
  note: string;
  /** A writing prompt was tapped: the parent focuses the box and shows the question. */
  onPrompt: (question: string) => void;
  /** null when there's nothing to send yet (empty note). */
  buildInput: () => CaptionInput | null;
  flowId: string;
  /** An AI suggestion is in the box; Undo goes back to the user's own words. */
  accepted: boolean;
  /** False right after a suggestion is used, until the user types in the box again. */
  showHelp: boolean;
  onUse: (c: AcceptedCaption) => void;
  onUndo: () => void;
}) {
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });

  // The note the newest request was made for. If the user keeps typing while
  // it runs, the answer is for old words: drop it rather than overwrite theirs.
  const latestNote = useRef(note);
  useEffect(() => {
    latestNote.current = note;
  }, [note]);

  const hasWords = note.trim().length > 0;

  const ask = async () => {
    const input = buildInput();
    if (!input) return;
    const requestId = randomUUID();
    const askedFor = note;
    setPhase({ k: 'loading', requestId });
    void logEvent(db, 'ai_requested', null, { flowId, requestId });
    const deviceId = await getDeviceId(db);
    const r = await requestCaption(input, { requestId, deviceId });
    void logEvent(db, 'ai_result', null, {
      flowId,
      requestId,
      kind: r.kind,
      reason: r.kind === 'unavailable' ? r.reason : undefined,
      warnings: r.kind === 'ok' ? r.warnings.map((w) => w.code) : [],
      latencyMs: r.latencyMs,
    });
    setPhase((prev) => {
      if (prev.k !== 'loading' || prev.requestId !== requestId) return prev; // superseded
      if (latestNote.current !== askedFor) return { k: 'idle' }; // the note changed meanwhile
      return r.kind === 'ok' ? { k: 'preview', requestId, output: r.output, warnings: r.warnings } : { k: 'unavailable' };
    });
  };

  const use = () => {
    if (phase.k !== 'preview') return;
    void logEvent(db, 'ai_accepted', null, { flowId, requestId: phase.requestId });
    onUse({ requestId: phase.requestId, output: phase.output });
    setPhase({ k: 'idle' });
  };

  const keepMine = () => {
    if (phase.k === 'preview') void logEvent(db, 'ai_kept_mine', null, { flowId, requestId: phase.requestId });
    setPhase({ k: 'idle' });
  };

  const terms = phase.k === 'preview' ? warningTerms(phase.warnings) : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {WRITING_PROMPTS.map((q) => (
          <Pressable
            key={q}
            onPress={() => onPrompt(q)}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>

      {/* Hidden right after a suggestion is used; back once the user types in the box. */}
      <View style={styles.row}>
        {showHelp && (
          <Button
            title={phase.k === 'loading' ? S.newPage.ai.writing : S.newPage.ai.helpMe}
            variant="secondary"
            compact
            onPress={() => void ask()}
            disabled={!hasWords || phase.k === 'loading'}
          />
        )}
        {showHelp && !hasWords && <Text style={styles.small}>{S.newPage.ai.needWords}</Text>}
        {accepted && (
          <>
            <Text style={styles.small}>{S.newPage.ai.usingAi}</Text>
            <Pressable onPress={onUndo} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>{S.newPage.ai.undo}</Text>
            </Pressable>
          </>
        )}
      </View>

      {phase.k === 'preview' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{phase.output.title}</Text>
          <Text style={styles.cardCaption}>{phase.output.caption}</Text>
          {terms.length > 0 && <Text style={styles.check}>{S.newPage.ai.check(terms)}</Text>}
          <View style={[styles.row, { marginTop: 12 }]}>
            <Button title={S.newPage.ai.use} compact onPress={use} />
            <Button title={S.newPage.ai.retry} variant="secondary" compact onPress={() => void ask()} />
            <Button title={S.newPage.ai.keepMine} variant="ghost" compact onPress={keepMine} />
          </View>
        </View>
      )}

      {phase.k === 'unavailable' && <Text style={[styles.small, { marginTop: 8 }]}>{S.newPage.ai.unavailable}</Text>}

      <Text style={[styles.small, { marginTop: 8 }]}>{S.newPage.ai.disclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  chipText: { fontSize: 13, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  small: { fontSize: 12, color: colors.faint },
  link: { fontSize: 13, fontWeight: '600', color: colors.accent },
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.line,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardCaption: { marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.ink },
  check: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colors.accent },
});
