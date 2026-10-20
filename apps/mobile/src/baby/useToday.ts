import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localDateString } from '@/photos/dates';

/**
 * Today's local calendar date. Read once on mount (render must stay pure) and
 * refreshed whenever the app comes back to the foreground, so an app left open
 * overnight shows tomorrow's age when reopened.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateString(Date.now()));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(localDateString(Date.now()));
    });
    return () => sub.remove();
  }, []);
  return today;
}
