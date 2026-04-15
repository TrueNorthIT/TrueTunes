import type { SonosItem, SonosItemId, QueueItem } from '../types/sonos';

// ─── Defaults decoder ─────────────────────────────────────────────────────────

export function decodeDefaults(defaults: string | undefined): Record<string, unknown> | null {
  if (!defaults) return null;
  try { return JSON.parse(atob(defaults)); } catch { return null; }
}

// ─── Album param resolver ─────────────────────────────────────────────────────

export function resolveAlbumParams(item: SonosItem) {
  const rid = item.resource?.id as SonosItemId | undefined;
  const iid = typeof item.id === 'object' ? item.id as SonosItemId : undefined;
  return {
    albumId:   rid?.objectId  ?? iid?.objectId,
    serviceId: rid?.serviceId ?? iid?.serviceId,
    accountId: (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, ''),
    defaults:  item.resource?.defaults as string | undefined,
  };
}

// ─── Response normalisation ───────────────────────────────────────────────────

export function extractItems(data: unknown): SonosItem[] {
  if (!data) return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(data))               return data as SonosItem[];
  if (Array.isArray(d['items']))         return d['items'] as SonosItem[];
  if (Array.isArray(d['resources']))     return d['resources'] as SonosItem[];
  if (Array.isArray(d['services'])) {
    const flat: SonosItem[] = [];
    for (const svc of d['services'] as Record<string, unknown>[]) {
      const r = (svc['results'] ?? svc) as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        if (Array.isArray(r[key])) {
          (r[key] as SonosItem[]).forEach(item => {
            flat.push({ ...item, _svcId: svc['serviceId'] } as SonosItem);
          });
        }
      }
    }
    return flat;
  }
  return [];
}

// ─── Field extractors ─────────────────────────────────────────────────────────

export function getName(item: SonosItem): string {
  return item?.name ?? item?.title ?? item?.resource?.name ?? item?.track?.name ?? '(unknown)';
}

function resolveArtistName(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { name?: string }).name ?? '';
  }
  return String(raw);
}

export function getSub(item: SonosItem): string {
  const raw = item?.artist ?? item?.primaryArtist ?? item?.resource?.artist
           ?? item?.track?.artist ?? item?.description ?? item?.type ?? '';
  const result = resolveArtistName(raw);
  return item?.summary?.content ?? result;
}

export function getArtist(item: QueueItem): string {
  return resolveArtistName(item?.track?.artist ?? item?.artist ?? item?.primaryArtist ?? '');
}

export function getAlbum(item: QueueItem): string {
  const raw = item?.track?.album ?? item?.album ?? '';
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { name?: string }).name ?? '';
  }
  return String(raw);
}

export function getArt(item: SonosItem): string | null {
  return item?.track?.imageUrl
      ?? item?.track?.images?.[0]?.url
      ?? item?.imageUrl
      ?? item?.images?.[0]?.url
      ?? null;
}

export function browseSub(item: SonosItem): string {
  if (item?.summary?.content) return item.summary.content;
  const type    = item?.type ? item.type.charAt(0) + item.type.slice(1).toLowerCase() : '';
  const artists = item?.artists?.map((a) => a.name).join(', ') ?? getSub(item);
  return [type, artists].filter(Boolean).join(' \u2022 ');
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
