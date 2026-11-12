/* RT — a very small Supabase Realtime client (Broadcast + Presence only).
   Speaks the Phoenix channel protocol over one WebSocket: join, heartbeat,
   broadcast, presence. Messages pass through and are never stored; no table,
   no database row, no key beyond the public one in supabase-config.js.

     const room = RT.join('tp:K7P2QX', { role: 'host' });   // or 'remote'
     room.on('cmd', fn); room.on('st', fn);
     room.on('peers', ({ host, remote }) => …);
     room.on('status', (s) => …);        // 'connecting' | 'online' | 'offline'
     room.send('st', payload); room.leave();                                  */
(() => {
  const cfg = window.WAITLIST_SUPABASE || {};
  const ready = () => !!(cfg.url && cfg.anonKey && 'WebSocket' in window);

  function join(name, opts = {}) {
    const role = opts.role === 'host' ? 'host' : 'remote';
    const me = role + '-' + Math.random().toString(36).slice(2, 10);
    const topic = 'realtime:' + name;
    const handlers = new Map();
    let ws = null, ref = 0, joinRef = null;
    let beat = 0, beatPending = false, retry = 0, retryTimer = 0;
    let closed = false, status = 'offline';
    let roster = {};   // presence key → role

    const emit = (ev, data) => handlers.get(ev)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    const setStatus = (s) => { if (status !== s) { status = s; emit('status', s); } };
    const count = () => {
      const n = { host: 0, remote: 0 };
      Object.entries(roster).forEach(([key, r]) => { if (key !== me && r in n) n[r]++; });
      return n;
    };
    const push = (event, payload, to = topic) => {
      if (ws?.readyState !== 1) return false;
      ws.send(JSON.stringify({ topic: to, event, payload, ref: String(++ref), join_ref: joinRef }));
      return true;
    };

    function open() {
      if (closed || !ready()) return setStatus('offline');
      clearTimeout(retryTimer);
      setStatus('connecting');
      const url = cfg.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg.anonKey) + '&vsn=1.0.0';
      let sock;
      try { sock = ws = new WebSocket(url); } catch (e) { return down(); }
      sock.onopen = () => {
        joinRef = String(++ref);
        sock.send(JSON.stringify({
          topic, event: 'phx_join', ref: joinRef, join_ref: joinRef,
          payload: { config: { broadcast: { ack: false, self: false }, presence: { key: me }, private: false } },
        }));
        beatPending = false;
        clearInterval(beat);
        beat = setInterval(heartbeat, 25000);
      };
      sock.onmessage = (m) => {
        let d;
        try { d = JSON.parse(m.data); } catch (e) { return; }
        if (d.topic === 'phoenix') { beatPending = false; return; }
        if (d.topic !== topic) return;
        const p = d.payload || {};
        if (d.event === 'phx_reply' && d.ref === joinRef) {
          if (p.status !== 'ok') return down(sock);
          retry = 0;
          setStatus('online');
          push('presence', { type: 'presence', event: 'track', payload: { role } });
          emit('open');
        } else if (d.event === 'broadcast') {
          emit(p.event, p.payload);
        } else if (d.event === 'presence_state') {
          roster = {};
          Object.entries(p).forEach(([key, v]) => { roster[key] = v.metas?.[0]?.role; });
          emit('peers', count());
        } else if (d.event === 'presence_diff') {
          Object.keys(p.leaves || {}).forEach((key) => { delete roster[key]; });
          Object.entries(p.joins || {}).forEach(([key, v]) => { roster[key] = v.metas?.[0]?.role; });
          emit('peers', count());
        } else if (d.event === 'phx_error' || d.event === 'phx_close') {
          down(sock);
        }
      };
      sock.onclose = () => down(sock);
      sock.onerror = () => down(sock);
    }

    function heartbeat() {
      if (beatPending) return down(ws);   // the last one was never answered: the line is dead
      beatPending = push('heartbeat', {}, 'phoenix');
    }

    function down(sock) {
      if (sock && sock !== ws) return;   // an old socket closing late
      clearInterval(beat);
      if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (e) { /* already gone */ } }
      ws = null;
      const had = Object.keys(roster).length;
      roster = {};
      if (had) emit('peers', count());
      if (closed) return setStatus('offline');
      setStatus(navigator.onLine === false ? 'offline' : 'connecting');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(open, Math.min(8000, 800 * 2 ** retry++));
    }

    // back from the background or back online: don't wait for the retry timer
    function nudge() {
      if (closed || document.visibilityState === 'hidden') return;
      if (!ws) { retry = 0; return open(); }
      if (ws.readyState === 1) {   // phones freeze sockets silently — ask, and reconnect if nobody answers
        beatPending = false; heartbeat();
        setTimeout(() => { if (beatPending) down(ws); }, 3000);
      }
    }
    document.addEventListener('visibilitychange', nudge);
    addEventListener('online', nudge);
    const lost = () => { if (!closed) down(ws); };
    addEventListener('offline', lost);

    const room = {
      on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev).add(fn); return room; },
      send: (event, payload) => push('broadcast', { type: 'broadcast', event, payload }),
      leave() {
        closed = true;
        clearTimeout(retryTimer);
        document.removeEventListener('visibilitychange', nudge);
        removeEventListener('online', nudge);
        removeEventListener('offline', lost);
        push('phx_leave', {});
        down(ws);
      },
      get status() { return status; },
      get peers() { return count(); },
    };
    open();
    return room;
  }

  window.RT = { join, ready };
})();
