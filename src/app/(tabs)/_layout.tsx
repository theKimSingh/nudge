import { usePathname } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { FloatingMic } from '@/src/components/floating-mic';
import { ThemedView } from '@/src/components/themed-view';
import { useAgentSessionCtx } from '@/src/features/agent/context/agent-session-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

export default function TabsLayout() {
  const pathname = usePathname();
  // '/' or '/todo' both resolve to the todo tab.
  const onTodo = pathname === '/' || pathname === '/todo' || pathname.endsWith('/todo');

  const agent = useAgentSessionCtx();
  const agentActive = agent.phase !== 'idle';

  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // Tab tints follow the scheme — light text/icons on dark glass, dark on
  // light.
  const tabFg = isDark ? '#ECEDEE' : '#0A0A0A';
  const tabMuted = isDark ? '#7C7D80' : '#7C7C80';

  // During voice mode, hide only the NON-active trigger. The active tab must
  // stay visible to iOS — otherwise UITabBarController has no focused tab and
  // renders a blank white screen. TodoScreen stays mounted → scroll + state
  // preserved.
  //
  // ThemedView (not bare View) at the root so the area behind the native tab
  // bar stays themed during tab-switch animations — otherwise the bar's
  // sampled background flashes light gray for a frame.
  return (
    <ThemedView style={{ flex: 1 }}>
      <NativeTabs
        tintColor={tabFg}
        iconColor={{ default: tabMuted, selected: tabFg }}
        labelStyle={{ color: tabFg }}
        minimizeBehavior="never"
      >
        <NativeTabs.Trigger name="todo" hidden={agentActive && !onTodo}>
          <Icon sf="checklist" />
          <Label hidden>ToDo</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar" hidden={agentActive && onTodo}>
          <Icon sf="calendar" />
          <Label hidden>Calendar</Label>
        </NativeTabs.Trigger>
      </NativeTabs>

      {onTodo ? <FloatingMic /> : null}
    </ThemedView>
  );
}
