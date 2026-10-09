// Pure helpers ported from TrueTunes/src/main.ts (findTicket, extractDevices).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deep-search an arbitrary JSON object for the WebSocket ticket UUID. */
export function findTicket(obj: unknown, depth = 0): string | null {
  if (depth > 10 || obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findTicket(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    // Prefer keys that look like 'ticket'
    for (const [key, val] of Object.entries(rec)) {
      if (key.toLowerCase().includes('ticket') && typeof val === 'string' && UUID_RE.test(val)) {
        return val;
      }
    }
    for (const val of Object.values(rec)) {
      const hit = findTicket(val, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

interface WsDevice {
  info?: { id?: string; name?: string };
  groupId?: string;
  isCoordinator?: boolean;
}

export interface GroupInfo {
  /** Full groupId with session (RINCON_xxx:sessionId). */
  id: string;
  /** Bare RINCON ID - used as queueId. */
  coordinatorId: string;
  /** Room/group name. */
  name: string;
  playerIds: string[];
}

export function extractDevices(payload: unknown): {
  coordinatorGroupIds: string[];
  playerIds: string[];
  groups: GroupInfo[];
} {
  const devices: WsDevice[] = (payload as { devices?: WsDevice[] })?.devices ?? [];

  // groupId -> coordinator + all members
  const groupMap = new Map<string, { coordinator?: WsDevice; members: WsDevice[] }>();
  for (const d of devices) {
    if (!d.groupId) continue;
    if (!groupMap.has(d.groupId)) groupMap.set(d.groupId, { members: [] });
    const g = groupMap.get(d.groupId)!;
    g.members.push(d);
    if (d.isCoordinator) g.coordinator = d;
  }

  const coordinatorGroupIds: string[] = [];
  const groups: GroupInfo[] = [];

  for (const [groupId, { coordinator, members }] of groupMap) {
    if (!coordinator?.info?.id) continue;
    coordinatorGroupIds.push(groupId);
    groups.push({
      id: groupId,
      coordinatorId: coordinator.info.id,
      name: coordinator.info.name ?? coordinator.info.id,
      playerIds: members.map((m) => m.info?.id ?? '').filter(Boolean),
    });
  }

  // Deduplicate player IDs across all groups
  const seen = new Set<string>();
  const playerIds: string[] = [];
  for (const d of devices) {
    if (d.info?.id && !seen.has(d.info.id)) {
      seen.add(d.info.id);
      playerIds.push(d.info.id);
    }
  }

  return { coordinatorGroupIds, playerIds, groups };
}

/** Kept for the Phase 0 spike screen. */
export function extractGroups(payload: unknown): GroupInfo[] {
  return extractDevices(payload).groups;
}

/** RFC4122-ish v4 id; Hermes has no guaranteed crypto.randomUUID. */
export function newCorrId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
