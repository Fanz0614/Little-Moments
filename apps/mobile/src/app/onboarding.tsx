import React from 'react';
import { useToday } from '@/baby/useToday';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { BabyForm } from '@/baby/BabyForm';
import { useBaby } from '@/baby/BabyContext';
import { createBaby } from '@/db/babies';
import { S } from '@/strings';

/**
 * Shown until a profile exists (guarded in _layout). Saving flips the guard,
 * and the router moves to the home screen on its own.
 */
export default function Onboarding() {
  const db = useSQLiteContext();
  const { setBaby } = useBaby();
  const today = useToday();
  return (
    <BabyForm
      intro={S.baby.onboardingIntro}
      submitLabel={S.baby.create}
      initial={{ nickname: '', name: '', birthday: today, gender: 'unspecified', avatarPath: null }}
      onSubmit={async (fields) => setBaby(await createBaby(db, randomUUID(), fields, Date.now()))}
    />
  );
}
