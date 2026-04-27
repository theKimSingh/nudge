import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function LogoTitle() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={{ width: 30, height: 30 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Nudge</Text>
    </View>
  );
}


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: true,
          headerTitle: () => <LogoTitle />,
          headerTransparent: true,
          headerBackground: () => (
            <BlurView
              tint="light"
              intensity={60}
              style={StyleSheet.absoluteFill}
            />
          ),
          tabBarButton: HapticTab,

          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <View style={StyleSheet.absoluteFill}>
              <BlurView
                tint="light"
                intensity={80}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 30,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)'
                  }
                ]}
              />
            </View>
          ),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            headerShown: false, // Index uses ParallaxScrollView header
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            headerShown: false, // Index uses ParallaxScrollView header

            tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
          }}
        />
      </Tabs>

      {/* Floating Circle Button */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => router.push('/voice-chat')}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonEmoji}>🎙️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    elevation: 0,
    backgroundColor: 'transparent',
    borderRadius: 30,
    height: 60,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 100, // Moved up slightly more
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#CC0000', // Darker red
    justifyContent: 'center',
    alignItems: 'center',
    // Removed shadow/glow effects
  },
  buttonEmoji: {
    fontSize: 24,
    textAlign: 'center',
  },
