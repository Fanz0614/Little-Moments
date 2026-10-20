import React from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BabyForm } from '@/baby/BabyForm';
import { useBaby } from '@/baby/BabyContext';
import { updateBaby } from '@/db/babies';
import { deleteIfExists } from '@/photos/files';
import { S } from '@/strings';

export default function EditBaby() {
  const db = useSQLiteContext();
  const { baby, setBaby } = useBaby();
  if (!baby) return null; // guarded in _layout; only reachable with a profile

  return (
    <BabyForm
      submitLabel={S.common.save}
      initial={{ nickname: baby.nickname, name: baby.name ?? '', birthday: baby.birthday, gender: baby.gender, avatarPath: baby.avatarPath }}
      onSubmit={async (fields) => {
        const now = Date.now();
        await updateBaby(db, baby.id, fields, now);
        // The old photo is unreferenced once the new profile is saved.
        if (baby.avatarPath && baby.avatarPath !== fields.avatarPath) deleteIfExists(baby.avatarPath);
        setBaby({ ...baby, ...fields, updatedAt: now });
        router.back();
      }}
    />
  );
}
