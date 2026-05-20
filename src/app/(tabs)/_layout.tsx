import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { usePathname } from 'expo-router';
import { View } from 'react-native';

import { FloatingMic } from '@/src/components/floating-mic';
import { FloatingTabBar } from '@/src/components/floating-tab-bar';
import { TodoScreen } from '@/src/features/todo/screens/todo-screen';
import { CalendarScreen } from '@/src/features/calendar/screens/calendar-screen';

const Tab = createBottomTabNavigator();

export default function TabsLayout() {
  // FloatingMic only renders on the todo tab — the agent's listening UI
  // (overlay + edge glow) is hosted by TodoScreen, so the mic shouldn't be
  // tappable elsewhere.
  const pathname = usePathname();
  const onTodo =
    pathname === '/' ||
    pathname === '/todo' ||
    pathname.endsWith('/todo');

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

      {onTodo ? <FloatingMic /> : null}
    </View>
  );
}
