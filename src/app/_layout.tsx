import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/profile" options={{ title: 'Your profile' }} />
          <Stack.Screen name="onboarding/schedule" options={{ title: 'Your classes' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="profile/[id]"
            options={{ presentation: 'modal', title: 'Profile' }}
          />
          <Stack.Screen name="inbox" options={{ title: 'Notifications' }} />
          <Stack.Screen name="study/new" options={{ title: 'New study session' }} />
          <Stack.Screen name="courses" options={{ title: 'My classes' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
