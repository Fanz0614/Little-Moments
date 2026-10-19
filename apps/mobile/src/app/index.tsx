import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deletePage, listPages, type PageSummary } from '@/db/repo';
import { creationStats, type CreationStats } from '@/db/events';
import { cleanupOrphans } from '@/photos/cleanup';
import { deleteIfExists, docUri } from '@/photos/files';
import { formatJournalDate } from '@lm/layout-engine';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';

export default function Home() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [stats, setStats] = useState<CreationStats | null>(null);

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
    Alert.alert('删除这一页？', formatJournalDate(p.journalDate, 'zh'), [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
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
          headerRight: () => <Button title="新建" compact onPress={() => router.push('/new')} />,
        }}
      />
      {pages && pages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>还没有手账</Text>
          <Text style={styles.emptyBody}>选 3–5 张今天的照片，写一句话，{'\n'}剩下的排版交给 Little Moments。</Text>
          <Button title="做第一页" onPress={() => router.push('/new')} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={pages ?? []}
          numColumns={columns}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, gap }}
          columnWrapperStyle={{ gap }}
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
                {formatJournalDate(item.journalDate, 'zh')}
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
  return (
    <Text style={styles.stats}>
      本机统计：{stats.measuredPages} 页从开始到首次导出的中位耗时 {mins < 1 ? `${Math.round(stats.medianMs / 1000)} 秒` : `${mins.toFixed(1)} 分钟`}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
