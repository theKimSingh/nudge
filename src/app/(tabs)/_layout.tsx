import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/src/components/floating-tab-bar';
import { TasksProvider } from '@/src/features/todo/context/tasks-context';
import { ColorSchemeOverride } from '@/src/hooks/color-scheme-override';

export default function TabLayout() {
  return (
    <ColorSchemeOverride value="light">
      <TasksProvider>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <FloatingTabBar {...props} />}
        >
          <Tabs.Screen name="todo" options={{ title: 'ToDo' }} />
          <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </TasksProvider>
    </ColorSchemeOverride>
  );
}
