// Klien kecil Supabase Realtime (Broadcast + Presence saja): protokol Phoenix lewat satu WebSocket.
// Pesan hanya lewat, tidak disimpan di mana pun. Sambung ulang otomatis.
import { RT_URL, RT_KEY } from './config.js';

export function joinRoom(name, id, meta) {
  const topic = 'realtime:' + name, handlers = {}, roster = new Map();   // id → meta
  let ws = null, ref = 0, joinRef = null, beat = 0, beatPending = false, retry = 0, timer = 0, closed = false, status = 'offline';
  const emit = (ev, d) => (handlers[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });
  const setStatus = s => { if (s !== status) { status = s; emit('status', s); } };
  const push = (event, payload, to = topic) => { if (ws?.readyState !== 1) return false; ws.send(JSON.stringify({ topic: to, event, payload, ref: String(++ref), join_ref: joinRef })); return true; };
  const track = () => push('presence', { type: 'presence', event: 'track', payload: meta });
  const add = o => { for (const [k, v] of Object.entries(o || {})) roster.set(k, v.metas?.at(-1) || {}); };

  function open() {
    if (closed) return;
    clearTimeout(timer); setStatus('connecting');
    let s;
    try { s = ws = new WebSocket(RT_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(RT_KEY) + '&vsn=1.0.0'); } catch { return down(); }
    s.onopen = () => {
      joinRef = String(++ref);
      s.send(JSON.stringify({ topic, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: { config: { broadcast: { ack: false, self: false }, presence: { key: id }, private: false } } }));
      beatPending = false; clearInterval(beat); beat = setInterval(heartbeat, 25000);
    };
    s.onmessage = m => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.topic === 'phoenix') { beatPending = false; return; }
      if (d.topic !== topic) return;
      const p = d.payload || {};
      if (d.event === 'phx_reply' && d.ref === joinRef) { if (p.status !== 'ok') return down(s); retry = 0; track(); setStatus('online'); }
      else if (d.event === 'broadcast') emit(p.event, p.payload || {});
      else if (d.event === 'presence_state') { roster.clear(); add(p); emit('state', roster); emit('peers', roster); }
      else if (d.event === 'presence_diff') { Object.keys(p.leaves || {}).forEach(k => roster.delete(k)); add(p.joins); emit('peers', roster); }   // ganti meta = leave + join: join terakhir menang
      else if (d.event === 'phx_error' || d.event === 'phx_close') down(s);
    };
    s.onclose = s.onerror = () => down(s);
  }
  function heartbeat() { if (beatPending) return down(ws); beatPending = push('heartbeat', {}, 'phoenix'); }
  function down(s) {
    if (s && s !== ws) return;
    clearInterval(beat);
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch {} }
    ws = null;
    if (roster.size) { roster.clear(); emit('peers', roster); }
    if (closed) return setStatus('offline');
    setStatus('connecting'); clearTimeout(timer); timer = setTimeout(open, Math.min(8000, 800 * 2 ** retry++));
  }
  function nudge() {   // kembali dari latar / online lagi
    if (closed || document.hidden) return;
    if (!ws) { retry = 0; return open(); }
    if (ws.readyState === 1) { beatPending = false; heartbeat(); setTimeout(() => { if (beatPending) down(ws); }, 3000); }
  }
  const lost = () => { if (!closed) down(ws); };
  document.addEventListener('visibilitychange', nudge); addEventListener('online', nudge); addEventListener('offline', lost);
  const room = {
    on(ev, f) { (handlers[ev] ||= []).push(f); return room; },
    send: (event, payload) => push('broadcast', { type: 'broadcast', event, payload }),
    meta(m) { meta = m; if (status === 'online') track(); },
    get status() { return status; }, roster,
    leave() {
      closed = true; clearTimeout(timer);
      document.removeEventListener('visibilitychange', nudge); removeEventListener('online', nudge); removeEventListener('offline', lost);
      for (const k of Object.keys(handlers)) delete handlers[k];
      push('phx_leave', {}); const s = ws; setTimeout(() => down(s), 250);   // beri waktu pesan terakhir terkirim
    },
  };
  setTimeout(open, 0);   // setelah pendengar dipasang
  return room;
}
