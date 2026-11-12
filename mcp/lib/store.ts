import { Redis } from '@upstash/redis';

let redis: Redis | undefined;

/** Upstash Redis from the Vercel Marketplace integration (KV_REST_API_*), or plain Upstash env names. */
export function kv(): Redis {
  if (!redis) {
    const url = process.env['KV_REST_API_URL'] ?? process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['KV_REST_API_TOKEN'] ?? process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (!url || !token) throw new Error('Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN)');
    redis = new Redis({ url, token });
  }
  return redis;
}

export const DAY = 24 * 60 * 60;

export interface Activity {
  at: number;
  who: string;
  what: string;
}

/** A short rolling log of what people asked the speakers to do, for "who skipped my song?". */
export async function recordActivity(who: string, what: string): Promise<void> {
  try {
    const entry: Activity = { at: Date.now(), who, what };
    await kv().lpush('activity', JSON.stringify(entry));
    await kv().ltrim('activity', 0, 199);
  } catch (err) {
    console.warn('[activity] not recorded:', err);
  }
}

export async function recentActivity(count: number): Promise<Activity[]> {
  const rows = await kv().lrange<string | Activity>('activity', 0, count - 1);
  return rows.map((r) => (typeof r === 'string' ? (JSON.parse(r) as Activity) : r));
}
