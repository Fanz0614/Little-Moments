import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { docUri } from '@/photos/files';
import { pickAvatar } from '@/photos/avatar';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { S } from '@/strings';
import { BirthdayField } from './BirthdayField';
import { useToday } from './useToday';
import { ageText, zodiacSign } from './derive';
import { GENDERS, NAME_MAX, NICKNAME_MAX, babyInputSchema, type BabyFields, type BabyInput, type Gender } from './profile';

type FieldErrors = Partial<Record<keyof BabyInput, string>>;

/**
 * Shared by onboarding and "edit profile". Validates with the Zod schema on
 * submit and shows the first error per field; never writes anything itself.
 */
export function BabyForm({
  initial,
  intro,
  submitLabel,
  onSubmit,
}: {
  initial: BabyInput;
  intro?: string;
  submitLabel: string;
  onSubmit: (fields: BabyFields) => Promise<void>;
}) {
  const [form, setForm] = useState<BabyInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const today = useToday();

  const set = <K extends keyof BabyInput>(key: K, value: BabyInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const chooseAvatar = async () => {
    try {
      const rel = await pickAvatar();
      if (rel) set('avatarPath', rel);
    } catch (e) {
      Alert.alert(S.baby.saveFailed, e instanceof Error ? e.message : String(e));
    }
  };

  const submit = async () => {
    const parsed = babyInputSchema(today).safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BabyInput;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      Alert.alert(S.baby.saveFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const preview = form.birthday <= today ? `${ageText(form.birthday, today)} · ${zodiacSign(form.birthday)}` : null;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}

        <View style={styles.avatarRow}>
          <Pressable onPress={chooseAvatar} accessibilityRole="button" accessibilityLabel={S.baby.avatar} style={styles.avatar}>
            {form.avatarPath ? (
              <Image source={{ uri: docUri(form.avatarPath) }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarPlus}>+</Text>
            )}
          </Pressable>
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{S.baby.avatar}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button compact variant="secondary" title={form.avatarPath ? S.baby.avatarChange : S.baby.avatarAdd} onPress={chooseAvatar} />
              {form.avatarPath ? <Button compact variant="ghost" title={S.baby.avatarRemove} onPress={() => set('avatarPath', null)} /> : null}
            </View>
          </View>
        </View>

        <Text style={styles.label}>{S.baby.nickname}</Text>
        <TextInput
          value={form.nickname}
          onChangeText={(v) => set('nickname', v)}
          placeholder={S.baby.nicknamePlaceholder}
          placeholderTextColor={colors.faint}
          maxLength={NICKNAME_MAX + 5}
          autoFocus={!initial.nickname}
          style={[styles.input, errors.nickname && styles.inputError]}
        />
        <FieldError text={errors.nickname} />

        <Text style={styles.label}>{S.baby.birthday}</Text>
        <BirthdayField value={form.birthday} onChange={(v) => set('birthday', v)} />
        {preview ? <Text style={styles.preview}>{preview}</Text> : null}
        <FieldError text={errors.birthday} />

        <Text style={styles.label}>{S.baby.gender}</Text>
        <View style={styles.segment}>
          {GENDERS.map((g: Gender) => (
            <Pressable
              key={g}
              onPress={() => set('gender', g)}
              accessibilityRole="button"
              accessibilityState={{ selected: form.gender === g }}
              style={[styles.chip, form.gender === g && styles.chipOn]}
            >
              <Text style={[styles.chipText, form.gender === g && styles.chipTextOn]}>{S.baby.genders[g]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{S.baby.name}</Text>
        <TextInput
          value={form.name ?? ''}
          onChangeText={(v) => set('name', v)}
          placeholder={S.baby.namePlaceholder}
          placeholderTextColor={colors.faint}
          maxLength={NAME_MAX + 5}
          style={[styles.input, errors.name && styles.inputError]}
        />
        <FieldError text={errors.name} />

        <Button title={submitLabel} onPress={submit} loading={saving} style={{ marginTop: 28 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? <Text style={styles.error}>{text}</Text> : null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
  intro: { fontSize: 15, lineHeight: 22, color: colors.softInk, marginBottom: 20 },
  label: { marginTop: 18, fontSize: 15, fontWeight: '700', color: colors.ink },
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
  inputError: { borderColor: colors.danger },
  error: { marginTop: 6, fontSize: 13, color: colors.danger },
  preview: { marginTop: 8, fontSize: 13, color: colors.softInk },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlus: { fontSize: 30, color: colors.faint },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.softInk },
  chipTextOn: { color: colors.ink, fontWeight: '600' },
});
