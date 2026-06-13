// Branday shared calendar store (Xtresse)
// Plain Node serverless function, no dependencies. Talks to an Upstash Redis
// (added through the Vercel Marketplace) over its REST API.
//
// Environment variables (set automatically when you connect the Upstash store,
// except the password which you add yourself):
//   KV_REST_API_URL / KV_REST_API_TOKEN     (or UPSTASH_REDIS_REST_URL / _TOKEN)
//   CALENDAR_EDIT_PASSWORD                   (you choose this; needed to save)

const STORE_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;
const PASSWORD    = process.env.CALENDAR_EDIT_PASSWORD;
const KEY = 'xtresse:calendar';

async function redis(command) {
  const r = await fetch(STORE_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + STORE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error('store responded ' + r.status);
  return r.json(); // { result: ... }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-edit-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    if (req.method === 'GET') {
      // Before the store is connected, return empty so the page shows its built-in calendar.
      if (!STORE_URL || !STORE_TOKEN) { res.status(200).json({ posts: [] }); return; }
      const out = await redis(['GET', KEY]);
      let posts = [];
      if (out && out.result) { try { posts = JSON.parse(out.result); } catch (e) { posts = []; } }
      res.status(200).json({ posts: Array.isArray(posts) ? posts : [] });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const key = req.headers['x-edit-key'] || body.key || '';
      if (!PASSWORD) { res.status(500).json({ error: 'Edit password is not configured on the server.' }); return; }
      if (key !== PASSWORD) { res.status(401).json({ error: 'unauthorized' }); return; }

      // A unlock check from the page sends { verify:true } and just wants a yes/no.
      if (body.verify) { res.status(200).json({ ok: true }); return; }

      if (!STORE_URL || !STORE_TOKEN) { res.status(500).json({ error: 'Storage is not connected yet.' }); return; }
      const posts = Array.isArray(body.posts) ? body.posts : null;
      if (!posts) { res.status(400).json({ error: 'no posts provided' }); return; }
      await redis(['SET', KEY, JSON.stringify(posts)]);
      res.status(200).json({ ok: true, count: posts.length });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
