import React, { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BabyProvider, useBaby } from '@/baby/BabyContext';
import { migrateDb } from '@/db/migrate';
import { colors } from '@/ui/theme';
import { S } from '@/strings';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** A baby profile is required: everything except onboarding is behind it. */
function RootStack() {
  const { baby } = useBaby();
  if (baby === undefined) return <Loading />;
  const hasBaby = baby !== null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Protected guard={hasBaby}>
        <Stack.Screen name="index" options={{ title: S.appName }} />
        <Stack.Screen name="new" options={{ title: S.newPage.title, presentation: 'modal' }} />
        <Stack.Screen name="page/[id]" options={{ title: '' }} />
        <Stack.Screen name="baby" options={{ title: S.baby.editTitle }} />
      </Stack.Protected>
      <Stack.Protected guard={!hasBaby}>
        <Stack.Screen name="onboarding" options={{ title: S.baby.onboardingTitle }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName="little-moments.db" onInit={migrateDb} useSuspense>
          <StatusBar style="dark" />
          <BabyProvider>
            <RootStack />
          </BabyProvider>
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
