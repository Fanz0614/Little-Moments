import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getPrimaryBaby } from '@/db/babies';
import type { Baby } from './profile';

type BabyState = {
  /** undefined while loading, null when no profile exists yet. */
  baby: Baby | null | undefined;
  setBaby: (b: Baby) => void;
};

const Ctx = createContext<BabyState | null>(null);

/** Holds the single Phase 1 baby profile for the whole app. */
export function BabyProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [baby, setBabyState] = useState<Baby | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getPrimaryBaby(db)
      .then((b) => alive && setBabyState(b))
      .catch((e) => {
        console.warn('failed to load baby profile', e);
        if (alive) setBabyState(null);
      });
    return () => {
      alive = false;
    };
  }, [db]);

  const setBaby = useCallback((b: Baby) => setBabyState(b), []);
  return <Ctx.Provider value={{ baby, setBaby }}>{children}</Ctx.Provider>;
}

export function useBaby(): BabyState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBaby must be used inside BabyProvider');
  return v;
}
