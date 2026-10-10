/* Supabase connection for the Next Up waitlist (Phase 2).
   PUBLIC values only — this file ships to every visitor:
   - url:     https://<project-ref>.supabase.co
   - anonKey: the "anon" (legacy JWT) or "publishable" (sb_publishable_…) key
   NEVER put the service_role / sb_secret_… key here.
   Leave both empty to fall back to the local (this-browser-only) demo. */
window.WAITLIST_SUPABASE = {
  url: 'https://hxghzjfthbxgcpxkysxa.supabase.co',
  anonKey: 'sb_publishable_iuvvOWOkk4EXXmJQMdA5sQ_xA4Ea7Br',
};
