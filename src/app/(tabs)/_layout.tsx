import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingTabBar } from '@/src/components/floating-tab-bar';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { TodoScreen } from '@/src/features/todo/screens/todo-screen';
import { CalendarScreen } from '@/src/features/calendar/screens/calendar-screen';

const Tab = createBottomTabNavigator();

function VoiceButton() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <Pressable
      onPress={() => router.push('/voice-chat')}
      style={({ pressed }) => [
        styles.voiceButton,
        { backgroundColor: palette.accent },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Voice chat"
    >
      <IconSymbol name="microphone.fill" size={24} color={palette.textInverse} />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="todo"
          component={TodoScreen}
          options={{
            title: 'Todo',
          }}
        />
        <Tab.Screen
          name="calendar"
          component={CalendarScreen}
          options={{
            title: 'Calendar',
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  voiceButtonContainer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 24,
    paddingBottom: 24,
    pointerEvents: 'box-none',
  },
  voiceButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
