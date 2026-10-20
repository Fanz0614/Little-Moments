import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deletePage, listPages, type PageSummary } from '@/db/repo';
import { creationStats, type CreationStats } from '@/db/events';
import { cleanupOrphans } from '@/photos/cleanup';
import { deleteIfExists, docUri } from '@/photos/files';
import { formatJournalDate } from '@lm/layout-engine';
import { useBaby } from '@/baby/BabyContext';
import { BabyHeader } from '@/baby/BabyHeader';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { S } from '@/strings';

export default function Home() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [stats, setStats] = useState<CreationStats | null>(null);
  const { baby } = useBaby();

  const refresh = useCallback(async () => {
    setPages(await listPages(db));
    setStats(await creationStats(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    cleanupOrphans(db).catch((e) => console.warn('cleanup failed', e));
  }, [db]);

  const columns = width >= 700 ? 4 : 2;
  const gap = 14;
  const tileW = (width - 20 * 2 - gap * (columns - 1)) / columns;

  const confirmDelete = (p: PageSummary) => {
    Alert.alert(S.home.deleteTitle, formatJournalDate(p.journalDate, 'en'), [
      { text: S.common.cancel, style: 'cancel' },
      {
        text: S.common.delete,
        style: 'destructive',
        onPress: async () => {
          await deletePage(db, p.id);
          if (p.thumbPath) deleteIfExists(p.thumbPath);
          await refresh();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () => <Button title={S.home.newPage} compact onPress={() => router.push('/new')} />,
        }}
      />
      {pages && pages.length === 0 ? (
        <View style={styles.empty}>
          {baby ? <BabyHeader baby={baby} style={styles.emptyHeader} /> : null}
          <Text style={styles.emptyTitle}>{S.home.emptyTitle}</Text>
          <Text style={styles.emptyBody}>{S.home.emptyBody}</Text>
          <Button title={S.home.firstPage} onPress={() => router.push('/new')} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={pages ?? []}
          numColumns={columns}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, gap }}
          columnWrapperStyle={{ gap }}
          ListHeaderComponent={baby ? <BabyHeader baby={baby} /> : undefined}
          ListFooterComponent={stats ? <StatsFooter stats={stats} /> : undefined}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/page/${item.id}`)}
              onLongPress={() => confirmDelete(item)}
              style={({ pressed }) => [{ width: tileW, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={[styles.thumb, { height: tileW * (842 / 595) }]}>
                {item.thumbPath ? (
                  <Image source={{ uri: docUri(item.thumbPath) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={styles.date} numberOfLines={1}>
                {formatJournalDate(item.journalDate, 'en')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function StatsFooter({ stats }: { stats: CreationStats }) {
  if (stats.medianMs == null) return null;
  const mins = stats.medianMs / 60000;
  const median = mins < 1 ? S.home.seconds(Math.round(stats.medianMs / 1000)) : S.home.minutes(mins);
  return <Text style={styles.stats}>{S.home.stats(stats.measuredPages, median)}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyHeader: { position: 'absolute', top: 20, left: 20, right: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },
  emptyBody: { marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.softInk, textAlign: 'center' },
  thumb: {
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    overflow: 'hidden',
    shadowColor: '#3C2814',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  date: { marginTop: 8, fontSize: 13, color: colors.softInk },
  stats: { marginTop: 24, fontSize: 12, color: colors.faint, textAlign: 'center' },
});
