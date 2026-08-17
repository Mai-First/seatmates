import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DialogHost from '../components/DialogHost';
import { AuthProvider } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

/** Inside ThemeProvider so the native header/background follow the scheme. */
function Navigator() {
  const { colors, scheme, type } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text, fontFamily: type.h2.fontFamily },
          // The (tabs) group has no title of its own, so without this the
          // back button on anything pushed from a tab reads the literal
          // route segment, "(tabs)". An empty label leaves just the themed
          // chevron (headerTintColor above).
          headerBackTitle: '',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/profile" options={{ title: 'your profile' }} />
        <Stack.Screen name="onboarding/schedule" options={{ title: 'your classes' }} />
        <Stack.Screen name="onboarding/tutorial" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat-options/[id]" options={{ title: 'chat options' }} />
        <Stack.Screen name="chat-media/[id]" options={{ title: 'photos & files' }} />
        <Stack.Screen name="chat-members/[id]" options={{ title: 'members' }} />
        {/* Was presentation: 'modal' -- but block/report both open a
            confirm() dialog, and DialogHost's own <Modal> stacked inside an
            already-modal-presented screen is a known way to break iOS's
            touch routing entirely (looks exactly like an app freeze, tab
            bar included). Every other pushed screen already behaves this
            way; profile/[id] wasn't a special case worth the risk. */}
        <Stack.Screen name="profile/[id]" options={{ title: 'profile' }} />
        <Stack.Screen name="inbox" options={{ title: 'notifications' }} />
        <Stack.Screen name="friend-requests" options={{ title: 'friend requests' }} />
        <Stack.Screen name="notification-settings" options={{ title: 'notification settings' }} />
        <Stack.Screen name="chats-archived" options={{ title: 'archived chats' }} />
        <Stack.Screen name="change-password" options={{ title: 'change password' }} />
        <Stack.Screen name="study/new" options={{ title: 'new study session' }} />
        <Stack.Screen name="courses" options={{ title: 'my classes' }} />
        <Stack.Screen name="admin/announce" options={{ title: 'send announcement' }} />
        <Stack.Screen name="admin/reports" options={{ title: 'reports' }} />
        <Stack.Screen name="report/[id]" options={{ title: 'report' }} />
        <Stack.Screen name="add-friend/[id]" options={{ title: 'add friend' }} />
        <Stack.Screen name="blocked" options={{ title: 'blocked profiles' }} />
      </Stack>
      <DialogHost />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  // Every text style names a custom family, so rendering before they load
  // would flash system font across the whole app.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <Navigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
