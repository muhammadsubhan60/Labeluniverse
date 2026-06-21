# Claude Code — Behavior Script for This Project

## Stack
- **Frontend**: React + TypeScript (CRA + CRACO), React Router v6, Axios, Recharts, Heroicons v2, socket.io-client
- **Backend**: Node.js + Express, MongoDB + Mongoose, socket.io
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Repo**: github.com/muhammadsubhan60/Labeluniverse, branch `main`

---

## Response Style

- **Short and direct.** One sentence update, then act. No preamble.
- **No summaries at the end.** The diff speaks for itself.
- **No emojis.** No headers in casual replies.
- **State what changed + what's next.** That's it.
- If something is unclear, ask one sharp question — not a list of options.

---

## How I Build

### Read before touching
Always read the current file before any edit. Never assume what's in it — linters and other edits change files between turns.

### Prefer targeted `Edit` over full `Write`
Only do a full `Write` (rewrite) when:
- The linter keeps reverting changes between read/edit
- More than ~40% of the file needs changing

### Parallel tool calls
Independent reads, searches, or commands → fire them in one message simultaneously.

### No over-engineering
- No abstractions beyond what the task needs
- No error handling for impossible cases
- No comments explaining what the code does — only comments for non-obvious WHY
- No backwards-compat shims for removed code

### Commit + push in one shot
```
git add <specific files>
git commit -m "feat/fix/refactor: short description\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```
Always stage specific files, never `git add -A` blindly.

---

## Design System (this project)

```
FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
```

**CSS classes:**
- `db-card` → card with bg, border-radius 16px, navy-200 border, shadow
- `db-card-hover` → adds hover lift
- `sh-table` → styled data table
- `btn btn-ghost btn-sm` → ghost button small
- `carrier-badge usps/ups/fedex/dhl` → colored carrier pill
- `spinner` → loading spinner
- `avatar avatar-sm avatar-indigo` → user avatar circle

**CSS variables:**
```
--navy-50/100/200/400/500/600/700/800/900
--accent-500 / --accent-600
--bg-card
--shadow-card / --shadow-lg
```

**Accent colors:**
- Indigo: `#6366f1` / gradient `linear-gradient(135deg,#6366f1,#4f46e5)`
- Success: `#22c55e` / `#10b981`
- Warning: `#f59e0b`
- Danger: `#ef4444`

**Page header pattern** (compact, no dark hero unless it's the admin dashboard):
- Title + badge inline
- Colored stat chips below
- CTA button right-aligned

**Modals/drawers** → always `ReactDOM.createPortal(..., document.body)` because the Layout `<Outlet>` wrapper uses `transform: translateY()` which creates a stacking context trap.

---

## API

```ts
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api')
```

All authenticated requests: `{ headers: { Authorization: `Bearer ${token}` } }`

Token from: `const { token } = useAuth()`

User shape: `{ id: string; firstName: string; lastName: string; email: string; role: 'admin' | 'reseller' | 'user' }`

---

## Key Files

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | All routes |
| `client/src/components/Layout.tsx` | Nav sidebar, Outlet wrapper |
| `client/src/contexts/AuthContext.tsx` | `useAuth()` → token, user |
| `client/src/contexts/SocketContext.tsx` | `useSocket()` → socket |
| `server/routes/stats.js` | Role-aware stats API |
| `server/models/Label.js` | Label schema (status, trackingStatus) |
| `server/models/ManifestJob.js` | Manifest job schema |

---

## Nav Structure (Layout.tsx)

```
Overview     → /dashboard, /activity, /leaderboard
My Store     → /integrations, /orders, /customers
Labels       → /labels/single, /labels/bulk, /labels/history, /labels/bulk-history
Manifests    → /manifest/upload, /manifest/history
```

Admin-only routes under `/admin/*` — protected by `<AdminOnly>` wrapper.

---

## Integrations Page (`/integrations`)

- **Live**: Shopify, Etsy
- **Coming soon**: eBay, Walmart, Amazon
- Logos via `simple-icons` npm package (`siShopify`, `siEbay`, `siEtsy`) — white SVG path on brand-color rounded square
- Drawers are portalled to `document.body`
- Etsy uses PKCE OAuth

---

## Common Patterns

**Fetch on mount with auth:**
```ts
const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
useEffect(() => { axios.get(`${API_BASE}/endpoint`, { headers: authHeader() }).then(...) }, [authHeader]);
```

**Input style objects** (`inp`, `lbl`) are defined at module level as `React.CSSProperties` constants — reuse them, don't redefine inline.

**Focus/blur for inputs:**
```ts
const focusI = (e) => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' });
const blurI  = (e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' });
```

---

## What to Avoid

- Don't generate external URLs unless confident they work (Clearbit logo API is dead)
- Don't use `git add -A` — stage specific files
- Don't add `console.log` debug statements
- Don't wrap everything in `try/catch` unless at a real boundary
- Don't add loading states for operations that are instant
- Don't amend commits — always create new ones
- Don't use `--no-verify` on hooks
