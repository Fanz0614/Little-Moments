import React from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { localDateString } from '@/photos/dates';
import { MIN_BIRTHDAY } from './profile';
import { colors, radius } from '@/ui/theme';

/** Calendar date -> local Date at noon (noon so no time zone shift can change the day). */
function toDate(cal: string): Date {
  const [y, m, d] = cal.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}

const MIN = toDate(MIN_BIRTHDAY);

export function BirthdayField({ value, onChange }: { value: string; onChange: (cal: string) => void }) {
  const max = new Date();
  const pick = (d: Date) => onChange(localDateString(d.getTime()));

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={toDate(value)}
        mode="date"
        display="compact"
        minimumDate={MIN}
        maximumDate={max}
        accentColor={colors.accent}
        onValueChange={(_e, d) => pick(d)}
        style={styles.ios}
      />
    );
  }

  // Android has no inline compact picker: show the date and open the system dialog on tap.
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.androidButton}
      onPress={() =>
        DateTimePickerAndroid.open({ value: toDate(value), mode: 'date', minimumDate: MIN, maximumDate: max, onValueChange: (_e, d) => pick(d) })
      }
    >
      <Text style={styles.androidText}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ios: { alignSelf: 'flex-start', marginTop: 6 },
  androidButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  androidText: { fontSize: 16, color: colors.ink },
});
