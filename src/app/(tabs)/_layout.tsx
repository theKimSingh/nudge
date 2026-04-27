import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FloatingTabBar } from '@/src/components/floating-tab-bar';
import { TodoScreen } from '@/src/features/todo/screens/todo-screen';
import { CalendarScreen } from '@/src/features/calendar/screens/calendar-screen';

const Tab = createBottomTabNavigator();

export default function TabsLayout() {
  return (
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
  );
}
