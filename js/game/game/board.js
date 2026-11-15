/* Papan skor global lewat RPC Supabase (lihat supabase/game.sql) + simpanan lokal.
   Tanpa SDK: fetch biasa ke PostgREST dengan kunci publishable dari js/supabase-config.js.
   Semua fungsi jaringan mengembalikan null kalau server tak terjangkau — game tetap jalan,
   papan menampilkan "NO SIGNAL", dan waktu terbaik tetap tersimpan di perangkat. */
const KEY = 'ihsan.game';

function isSecret(key) {
  if (/^sb_secret_/.test(key)) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (e) { return false; }
}

export function createBoard() {
  const local = { best: 0, name: '', mute: false };
  try { Object.assign(local, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage diblokir */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { /* abaikan */ } };

  const cfg = window.WAITLIST_SUPABASE;
  const online = !!(cfg && cfg.url && cfg.anonKey && !isSecret(cfg.anonKey));
  const base = online ? cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/' : '';
  const headers = online ? { apikey: cfg.anonKey, 'Content-Type': 'application/json' } : null;
  if (online && /^eyJ/.test(cfg.anonKey)) headers.Authorization = 'Bearer ' + cfg.anonKey;

  async function rpc(fn, body) {
    if (!online) throw new Error('offline');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const res = await fetch(base + fn, { method: 'POST', headers, body: JSON.stringify(body || {}), signal: ctl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'http-' + res.status);
      return data;
    } finally { clearTimeout(timer); }
  }

  return {
    online, local, save,
    /* [{ name, time_ms }] atau null */
    async top() { try { const rows = await rpc('game_top_scores', { p_limit: 10 }); return Array.isArray(rows) ? rows : null; } catch (e) { return null; } },
    /* id run (uuid) atau null; dipanggil saat stopwatch mulai */
    async start() { try { const id = await rpc('game_start_run', {}); return typeof id === 'string' ? id : null; } catch (e) { return null; } },
    /* dipanggil tepat saat kaset terakhir terpungut: server mencatat waktu selesainya sendiri */
    async finish(runId) { try { return (await rpc('game_finish_run', { p_run: runId })) === true; } catch (e) { return false; } },
    /* { rank } atau { error } */
    async submit(runId, name, ms, tapes, falls) {
      try {
        const rows = await rpc('game_submit_run', { p_run: runId, p_name: name, p_ms: ms, p_tapes: tapes, p_falls: falls });
        const r = Array.isArray(rows) ? rows[0] : rows;
        return r && r.rank ? { rank: r.rank } : { error: 'unknown' };
      } catch (e) { return { error: e.message || 'offline' }; }
    },
  };
}
