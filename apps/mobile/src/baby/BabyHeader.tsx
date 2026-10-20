import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { docUri } from '@/photos/files';
import { colors, radius } from '@/ui/theme';
import { S } from '@/strings';
import { ageText, zodiacSign } from './derive';
import type { Baby } from './profile';
import { useToday } from './useToday';

/** "Mia · 3 months 12 days · Leo" with avatar; tap to edit the profile. */
export function BabyHeader({ baby, style }: { baby: Baby; style?: StyleProp<ViewStyle> }) {
  const today = useToday();
  return (
    <Pressable
      onPress={() => router.push('/baby')}
      accessibilityRole="button"
      accessibilityLabel={S.baby.editTitle}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }, style]}
    >
      <View style={styles.avatar}>
        {baby.avatarPath ? (
          <Image source={{ uri: docUri(baby.avatarPath) }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.initial}>{baby.nickname.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {baby.nickname}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {ageText(baby.birthday, today)} · {zodiacSign(baby.birthday)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    marginBottom: 6,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.line,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  initial: { fontSize: 22, fontWeight: '700', color: colors.accent },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  meta: { marginTop: 2, fontSize: 14, color: colors.softInk },
});
