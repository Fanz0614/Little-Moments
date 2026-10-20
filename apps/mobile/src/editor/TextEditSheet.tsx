import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { FontRole, TextLayer } from '@lm/page-schema';
import { Button } from '@/ui/Button';
import { TEXT_COLORS, colors, radius } from '@/ui/theme';
import { S } from '@/strings';

const ROLES: { role: FontRole; label: string }[] = [
  { role: 'title', label: S.textSheet.roles.title },
  { role: 'body', label: S.textSheet.roles.body },
  { role: 'hand', label: S.textSheet.roles.hand },
];

export type TextEdit = Pick<TextLayer, 'text'> & { style: TextLayer['style'] };

export function TextEditSheet(props: { layer: TextLayer | null; onClose: () => void; onSave: (edit: TextEdit) => void }) {
  if (!props.layer) return null;
  // Keyed by layer id: each opening starts from that layer's current text/style.
  return <Sheet key={props.layer.id} {...props} layer={props.layer} />;
}

function Sheet({ layer, onClose, onSave }: { layer: TextLayer; onClose: () => void; onSave: (edit: TextEdit) => void }) {
  const [text, setText] = useState(layer.text);
  const [style, setStyle] = useState<TextLayer['style']>(layer.style);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            style={styles.input}
            placeholder={S.textSheet.placeholder}
            placeholderTextColor={colors.faint}
          />
          <View style={styles.row}>
            {ROLES.map((r) => (
              <Pressable
                key={r.role}
                onPress={() => setStyle({ ...style, role: r.role })}
                style={[styles.chip, style.role === r.role && styles.chipOn]}
              >
                <Text style={[styles.chipText, style.role === r.role && styles.chipTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() =>
                setStyle({ ...style, align: style.align === 'left' ? 'center' : style.align === 'center' ? 'right' : 'left' })
              }
              style={styles.chip}
            >
              <Text style={styles.chipText}>{S.textSheet.align[style.align]}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {TEXT_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={S.textSheet.color(c)}
                onPress={() => setStyle({ ...style, color: c })}
                style={[styles.swatch, { backgroundColor: c }, style.color === c && styles.swatchOn]}
              />
            ))}
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Button title={S.common.cancel} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title={S.common.done}
              onPress={() => onSave({ text, style })}
              disabled={text.trim().length === 0}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(40, 30, 20, 0.25)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  input: {
    minHeight: 100,
    maxHeight: 220,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.softInk },
  chipTextOn: { color: colors.ink, fontWeight: '600' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line },
  swatchOn: { borderWidth: 3, borderColor: colors.accent },
});
