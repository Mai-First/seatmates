// Expo push registration. Every notification row inserted in Postgres is
// fanned out to Expo's push API by a DB trigger (see migrations) — this file's
// only job is getting a token onto the profile.
//
// Reality check: remote push does NOT work in Expo Go on current SDKs, and the
// token call needs an EAS projectId. So this is a silent no-op on web, in
// Expo Go, and in simulators — and lights up for free the day the team makes
// an EAS dev build. That's deliberate (PLAN: push is cut-first scope).
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

let attempted = false;

export async function registerPush(userId: string) {
  if (attempted || Platform.OS === 'web' || !Device.isDevice) return;
  attempted = true;
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (token) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    }
  } catch {
    // Expo Go / missing projectId / permission quirks — fine, in-app inbox covers it.
  }
}
