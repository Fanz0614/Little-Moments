import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { STICKERS, type StickerDef } from '@lm/layout-engine';
import { cssColor } from '@/render/PageContent';
import { colors, radius } from '@/ui/theme';

const SIZE = 44;

function StickerIcon({ def }: { def: StickerDef }) {
  const path = Skia.Path.MakeFromSVGString(def.path);
  if (!path) return null;
  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Group transform={[{ scale: SIZE / 24 }]}>
        <Path path={path} color={cssColor(def.defaultColor)} />
      </Group>
    </Canvas>
  );
}

export function StickerPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (def: StickerDef) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>贴纸</Text>
          <View style={styles.grid}>
            {STICKERS.map((s) => (
              <Pressable key={s.id} onPress={() => onPick(s)} style={styles.cell} accessibilityLabel={s.name}>
                <StickerIcon def={s} />
                <Text style={styles.label}>{s.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
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
    paddingBottom: 36,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: {
    width: 76,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  label: { fontSize: 12, color: colors.softInk },
});
