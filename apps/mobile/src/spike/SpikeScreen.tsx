import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { BASE_URL, SESSION_COOKIE, SPOOF_UA } from '../sonos/constants';
import { extractGroups, findTicket } from '../sonos/protocol';
import { createSonosClient } from '../sonos/sonosClient';
import type { SonosConfig } from '../sonos/types';
import { SonosWs } from '../sonos/wsClient';

const TOKEN_KEY = 'sonos.sessionToken';
const mask = (t: string) => `${t.slice(0, 8)}...(${t.length} chars)`;

/**
 * Phase 0 go/no-go spike. One button per link in the chain so a failure pinpoints
 * exactly where a phone can't do what the Electron main process does.
 */
export function SpikeScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [showLogin, setShowLogin] = useState(false);
  const token = useRef<string | null>(null);
  const ticketRef = useRef<string | null>(null);
  const groupId = useRef<string | null>(null);
  const wsRef = useRef<SonosWs | null>(null);
  const config = useRef<SonosConfig>({}).current;

  const log = useCallback((msg: string) => {
    console.log('[spike]', msg);
    const stamp = new Date().toLocaleTimeString();
    setLines((prev) => [...prev.slice(-200), `${stamp}  ${msg}`]);
  }, []);

  const run = (name: string, fn: () => Promise<void>) => async () => {
    log(`> ${name}`);
    try {
      await fn();
    } catch (e) {
      log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Step 2: HttpOnly cookie via the native CookieManager.
  const readCookie = run('read cookie', async () => {
    const cookies = await CookieManager.get(BASE_URL);
    log(`cookies on ${BASE_URL}: ${Object.keys(cookies).join(', ') || '(none)'}`);
    const c = cookies[SESSION_COOKIE];
    if (!c) throw new Error(`${SESSION_COOKIE} not visible - sign in first, or HttpOnly cookies are hidden`);
    token.current = c.value;
    await SecureStore.setItemAsync(TOKEN_KEY, c.value);
    log(`OK session token ${mask(c.value)}, expires=${c.expires ?? 'session'}; saved to SecureStore`);
  });

  const restore = run('restore token from SecureStore', async () => {
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!t) throw new Error('nothing stored');
    token.current = t;
    log(`OK restored ${mask(t)} (proves persistence if you killed the app first)`);
  });

  // Step 3: manual Cookie + User-Agent headers on RN fetch.
  const fetchMfe = run('GET /api/mfe', async () => {
    if (!token.current) throw new Error('no token');
    const res = await fetch(`${BASE_URL}/api/mfe`, {
      headers: {
        Cookie: `${SESSION_COOKIE}=${token.current}`,
        'User-Agent': SPOOF_UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
      },
    });
    log(`status ${res.status}`);
    if (!res.ok) throw new Error(`MFE fetch ${res.status}`);
    const ticket = findTicket(await res.json());
    if (!ticket) throw new Error('no ticket in MFE response');
    ticketRef.current = ticket;
    log(`OK ticket ${ticket.slice(0, 8)}...`);
  });

  // Steps 4+5: WS with custom Origin, then the same bootstrap the desktop runs.
  const connectWs = run('WS connect + bootstrap', async () => {
    if (!ticketRef.current) throw new Error('no ticket - fetch /api/mfe first');
    wsRef.current?.close();
    const ws = new SonosWs((h, p) => {
      if (h['namespace'] === 'playbackExtended') {
        const state = (p as { playback?: { playbackState?: string } } | null)?.playback?.playbackState;
        if (state) log(`push playbackExtended: ${state}`);
      }
    });
    wsRef.current = ws;
    await ws.connect(ticketRef.current, log);

    const households = (await ws.send(
      { command: 'getHouseholds', namespace: 'households' },
      { connectedOnly: 'true' }
    )) as { households?: Array<{ id: string }> };
    const householdId = households.households?.[0]?.id;
    if (!householdId) throw new Error('no household');
    log(`household ${householdId}`);
    config.householdId = householdId;

    const devicesPush = ws.waitForPush('devices:devicesStatus');
    await ws.send({ namespace: 'devices', householdId, command: 'subscribe' }, {});
    const groups = extractGroups(await devicesPush);
    if (!groups.length) throw new Error('no groups');
    groups.forEach((g) => log(`  group "${g.name}" ${g.id}`));
    groupId.current = groups[0].id;
    config.groupId = groups[0].id;
    config.queueId = groups[0].coordinatorId;

    await ws.send({ namespace: 'playbackExtended', groupId: groupId.current, command: 'subscribe' }, {});
    log(`OK bootstrapped, active group "${groups[0].name}"`);
  });

  // Step 6: the ported client (src/sonos/sonosClient.ts) against real endpoints.
  const clientCalls = run('ported client: real API calls', async () => {
    const client = createSonosClient({
      config,
      getSessionToken: () => token.current,
      onUnauthorized: () => log('client: 401 (would re-authenticate)'),
      onEvent: (name, props) => log(`client event ${name} ${JSON.stringify(props ?? {})}`),
    });
    const summarize = (label: string, r: { data?: unknown; error?: string }) => {
      if (r.error) return log(`  ${label}: ERROR ${r.error}`);
      const json = JSON.stringify(r.data) ?? 'null';
      log(
        `  ${label}: ok, ${json.length} bytes, keys=${Object.keys((r.data as object) ?? {})
          .slice(0, 6)
          .join(',')}`
      );
    };
    summarize('getGroups', await client.fetch({ operationId: 'getGroups' }));
    await client.discoverServiceCredentials();
    log(`  discovered serviceId=${config.serviceId} accountId=${config.accountId}`);
    summarize('getQueueResources', await client.fetch({ operationId: 'getQueueResources', query: { count: '5' } }));
    summarize(
      'getFavoriteResources',
      await client.fetch({ operationId: 'getFavoriteResources', query: { count: '5' } })
    );
    summarize('searchHousehold', await client.fetch({ operationId: 'searchHousehold', query: { query: 'adam ant' } }));
  });

  const transport = (command: 'play' | 'pause') =>
    run(command, async () => {
      if (!wsRef.current?.isOpen || !groupId.current) throw new Error('not connected');
      await wsRef.current.send(
        { namespace: 'playback', groupId: groupId.current, command },
        { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
      );
      log(`OK ${command} acknowledged`);
    });

  const clearAll = run('clear cookies + stored token', async () => {
    await CookieManager.clearAll();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    token.current = null;
    log('cleared');
  });

  if (showLogin) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable style={styles.btn} onPress={() => setShowLogin(false)}>
          <Text style={styles.btnText}>Done signing in</Text>
        </Pressable>
        <WebView
          source={{ uri: BASE_URL }}
          userAgent={SPOOF_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          onNavigationStateChange={(s) => log(`nav: ${s.url}`)}
          onError={(e) => log(`webview error: ${e.nativeEvent.description}`)}
          onHttpError={(e) => log(`webview http ${e.nativeEvent.statusCode}: ${e.nativeEvent.url}`)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>Phase 0 spike</Text>
      <View style={styles.buttons}>
        <Btn label="1. Sign in (WebView)" onPress={() => setShowLogin(true)} />
        <Btn label="2. Read session cookie" onPress={readCookie} />
        <Btn label="   or restore stored" onPress={restore} />
        <Btn label="3. GET /api/mfe" onPress={fetchMfe} />
        <Btn label="4. WS connect + bootstrap" onPress={connectWs} />
        <Btn label="5a. Play" onPress={transport('play')} />
        <Btn label="5b. Pause" onPress={transport('pause')} />
        <Btn label="6. Ported client: real calls" onPress={clientCalls} />
        <Btn label="Clear all" onPress={clearAll} />
      </View>
      <ScrollView style={styles.log}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111', paddingTop: (StatusBar.currentHeight ?? 24) + 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 12, paddingBottom: 8 },
  buttons: { paddingHorizontal: 12, gap: 6 },
  btn: { backgroundColor: '#2a6df4', padding: 10, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
  log: { flex: 1, margin: 12, padding: 8, backgroundColor: '#000', borderRadius: 6 },
  logLine: { color: '#9f9', fontFamily: 'monospace', fontSize: 11, marginBottom: 2 },
});
