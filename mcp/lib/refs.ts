// Search hits are stored briefly under short refs, so a model hands back "t_ab12cd34ef" instead of ids.

import { sha256 } from './crypto';
import type { SearchHit } from './sonos/parse';
import { DAY, kv } from './store';

export type RememberedHit = SearchHit & { refId: string };

export async function rememberHits(hits: SearchHit[]): Promise<RememberedHit[]> {
  const out = hits.map((h) => ({
    ...h,
    refId: `${h.kind[0].toLowerCase()}_${sha256(`${h.ref.serviceId}:${h.ref.objectId}`).slice(0, 10)}`,
  }));
  if (out.length) {
    const p = kv().pipeline();
    for (const h of out) p.set(`hit:${h.refId}`, h, { ex: 7 * DAY });
    await p.exec();
  }
  return out;
}

export async function recallHit(refId: string): Promise<RememberedHit | null> {
  return kv().get<RememberedHit>(`hit:${refId.trim()}`);
}
