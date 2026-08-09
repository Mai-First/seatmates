import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui';
import { space, useTheme } from '../../lib/theme';

const SLIDES = [
  {
    icon: 'albums-outline',
    title: 'swipe',
    body: 'meet classmates who share your actual sections. right swipe to connect, left to pass.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'chats',
    body: 'every section gets a group chat automatically. connect with someone and you get a DM too.',
  },
  {
    icon: 'book-outline',
    title: 'study dates',
    body: 'post a study session for any of your classes. everyone enrolled can see it and RSVP.',
  },
  {
    icon: 'person-circle-outline',
    title: 'account',
    body: 'edit your profile, manage your classes, and control notifications, all from here.',
  },
] as const;

/** One-time walkthrough at the end of onboarding — never shown again after
 * this account's first run. */
export default function OnboardingTutorial() {
  const { colors, type } = useTheme();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  const finish = () => router.replace('/(tabs)');

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Pressable onPress={finish} style={styles.skip} hitSlop={8}>
        <Text style={[type.sub, { color: colors.subtle }]}>skip</Text>
      </Pressable>

      <View style={styles.center}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={slide.icon as never} size={40} color={colors.primary} />
        </View>
        <Text style={[type.title, { textAlign: 'center' }]}>{slide.title}</Text>
        <Text style={[type.body, { textAlign: 'center', color: colors.subtle, maxWidth: 320 }]}>
          {slide.body}
        </Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            style={[styles.dot, { backgroundColor: i === step ? colors.primary : colors.border }]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          title={last ? 'let’s go' : 'next'}
          onPress={() => (last ? finish() : setStep((s) => s + 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skip: { alignSelf: 'flex-end', padding: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  iconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { padding: space.lg, paddingTop: 0 },
});
