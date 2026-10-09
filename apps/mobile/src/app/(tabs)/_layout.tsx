import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/tabs';
import { Home, ListMusic, MoreHorizontal, Search } from 'lucide-react-native';
import { View } from 'react-native';
import { ConnectionBanner } from '../../ui/ConnectionBanner';
import { haptic } from '../../ui/haptics';
import { ImagePrefetcher } from '../../ui/ImagePrefetcher';
import { MiniPlayer } from '../../ui/MiniPlayer';
import { useRequireDisplayName } from '../../ui/social/useRequireDisplayName';
import { colors } from '../../ui/theme';

export default function TabsLayout() {
  // Attribution, playlists, Recently Played and Queuedle all key off the display name.
  useRequireDisplayName();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenListeners={{ tabPress: () => haptic.selection() }}
        // The mini player floats above the tab bar so it is visible on every tab.
        tabBar={(props) => (
          <View style={{ backgroundColor: colors.bg }}>
            <MiniPlayer />
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.text3,
          tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="search"
          options={{ title: 'Search', tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="queue"
          options={{ title: 'Queue', tabBarIcon: ({ color, size }) => <ListMusic color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }}
        />
      </Tabs>
      <ConnectionBanner />
      <ImagePrefetcher />
    </View>
  );
}
