/* Next Up — project ideas visitors can join the waitlist for.
   Phase 1: `seed` is the starting count (local demo only).
   Phase 2: the same ids become rows in the Supabase `ideas` table.
   status: 'voting' | 'in_production' | 'done' */
const WAITLIST_IDEAS = [
  {
    id: 'claude-motion-workflow',
    title: 'Motion Design Workflow with Claude',
    type: 'Web App · BYOK',
    price: 'FREE',
    desc: 'A web-based motion design workflow powered by Claude — bring your own API key.',
    status: 'voting',
    seed: 0,
  },
  {
    id: 'solo-streamer-kit',
    title: 'Solo Streamer Kit',
    type: 'Bundle',
    price: 'BUNDLE',
    desc: 'Everything a solo streamer needs to look like a full production team.',
    status: 'voting',
    seed: 0,
  },
  {
    id: 'ae-animated-caption',
    title: 'Animated Caption',
    type: 'After Effects Plugin',
    price: 'FREE',
    desc: 'Free After Effects plugin for animated, styled captions in a few clicks.',
    status: 'voting',
    seed: 0,
  },
];
