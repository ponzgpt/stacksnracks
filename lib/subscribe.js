// Newsletter signups: validate, rate-limit per IP, append to a JSONL file on the data volume.
import { appendFile, mkdir } from 'node:fs/promises';

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

export const validEmail = e => typeof e === 'string' && e.length <= 254 && EMAIL.test(e);

// Fixed-window limiter: `max` hits per `windowMs` per key.
// ponytail: in-memory, single replica; resets on deploy. Move to shared storage if we ever scale out.
export function rateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return key => {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      hits.set(key, { start: t, n: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return true;
    }
    return ++h.n <= max;
  };
}

export async function saveSubscriber(dataDir, email) {
  await mkdir(dataDir, { recursive: true });
  await appendFile(`${dataDir}/subscribers.jsonl`, JSON.stringify({ email: email.toLowerCase(), at: new Date().toISOString() }) + '\n');
}
