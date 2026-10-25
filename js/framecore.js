/* Frame math shared by the Free Tools (timecode, BPM ↔ frame).
   A rate keeps its exact fps as num/den plus the nominal base the timecode
   counts in (23.976 counts 24 labels a second). 29.97 and 59.94 can count
   drop-frame: labels are skipped, never frames. */
window.FrameCore = (() => {
  const RATES = [
    ['12', 12, 1], ['15', 15, 1], ['23.976', 24000, 1001], ['24', 24, 1], ['25', 25, 1],
    ['29.97', 30000, 1001], ['30', 30, 1], ['50', 50, 1], ['59.94', 60000, 1001], ['60', 60, 1],
  ].map(([id, num, den]) => {
    const base = Math.round(num / den);
    return { id, num, den, fps: num / den, base, canDrop: den === 1001 && base % 30 === 0 };
  });

  const rate = (id) => RATES.find((r) => r.id === id) || RATES.find((r) => r.id === '24');
  const pad = (n) => String(n).padStart(2, '0');

  function toTC(frames, r, df) {
    const neg = frames < 0;
    let f = Math.abs(Math.round(frames));
    if (df && r.canDrop) {
      const drop = r.base / 15;                 // 2 @ 29.97, 4 @ 59.94
      const perMin = r.base * 60 - drop;
      const per10 = r.base * 600 - drop * 9;
      const rem = f % per10;
      f += drop * 9 * Math.floor(f / per10) + (rem > drop ? drop * Math.floor((rem - drop) / perMin) : 0);
    }
    const s = Math.floor(f / r.base);
    const sep = df && r.canDrop ? ';' : ':';
    return `${neg ? '-' : ''}${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}${sep}${pad(f % r.base)}`;
  }

  /* "01:00:10:12", "1;00;10;12", "10:12", "1001012" → frames, or null */
  function fromTC(str, r, df) {
    let s = String(str).trim();
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1).trim();
    if (!s) return null;
    let parts;
    if (/^\d+$/.test(s)) {
      s = s.padStart(8, '0');
      parts = [s.slice(0, -6), s.slice(-6, -4), s.slice(-4, -2), s.slice(-2)];
    } else {
      parts = s.split(/[:;.,]/);
      if (parts.length > 4 || parts.some((p) => !/^\d+$/.test(p))) return null;
      while (parts.length < 4) parts.unshift('0');
    }
    const [h, m, sec, ff] = parts.map(Number);
    let f = (h * 3600 + m * 60 + sec) * r.base + ff;
    if (df && r.canDrop) {
      const mins = h * 60 + m;
      f -= (r.base / 15) * (mins - Math.floor(mins / 10));
    }
    return neg ? -f : f;
  }

  const toSeconds = (frames, r) => frames * r.den / r.num;
  const fromSeconds = (sec, r) => Math.round(sec * r.num / r.den);

  /* real wall-clock time: 1:02:03.456 */
  function clock(sec) {
    const neg = sec < 0;
    const ms = Math.round(Math.abs(sec) * 1000);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    return `${neg ? '-' : ''}${h ? h + ':' : ''}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}.${String(ms % 1000).padStart(3, '0')}`;
  }

  /* trim a number to at most `d` decimals: 14.0625 → "14.063", 15 → "15" */
  const num = (n, d = 3) => String(Number(n.toFixed(d)));

  /* user typing: accepts "29,97" as well as "29.97" */
  const parseNum = (v) => {
    const n = parseFloat(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  return { RATES, rate, toTC, fromTC, toSeconds, fromSeconds, clock, num, parseNum };
})();
