# Vibe Coding Prompts — Trae AI
# Use these to continue building in Trae AI after initial setup.
# Design system: dark ink (#0A0A0B), ember red (#E8452A), gold (#C9A96E)
# Fonts: Cormorant Garamond (display), DM Mono (labels/mono)

---

## WORK PAGE — Full Portfolio Grid

```
Build src/pages/Work.tsx for Imba Production.

Full portfolio with:
- Hero: eyebrow "Our Work", H1 "Every frame with purpose" (Cormorant Garamond)
- Filter bar: category pills (All, Brand, AI, Product, Social, Drone, Post)
  → font-mono-custom, active = ember bg + ink text, inactive = border only
- Masonry/grid: fetch from Supabase portfolio_items, filter by category
- Each card: dark bg, thumbnail, colored category badge top-right,
  play circle on hover, gradient overlay bottom, title + client in serif
- Use CAT_COLOR map from Home.tsx for per-category accent colors
- Hover: corner marks appear (4 small L-shaped borders in ember)
- Loading: skeleton cards with pulse animation
- Empty state: "More work coming soon." in mono italic

Colors: ink bg, ember accent, gold for titles. No rounded corners (square edges).
```

---

## SERVICE DETAIL PAGE — /services/:slug

```
Build src/pages/ServiceDetail.tsx for Imba Production.

Fetch service by slug from Supabase services table.
Layout:
- Full-width hero: service name in Cormorant 5rem, category tag above,
  tagline below in italic gold, dark bg with ember radial glow
- 2-col section: description left, feature list right
  Features: bullet = ember dot, title bold, desc muted small text
- Portfolio preview: 3 related portfolio items (same category)
- CTA strip: ember red bg, "Start your [service] project" + quote link
- Breadcrumb: Home → Services → [name] in mono tiny text

Same design tokens. Square corners everywhere. No card shadows.
```

---

## BLOG LIST + POST PAGES

```
Build src/pages/Blog.tsx and src/pages/BlogPost.tsx.

Blog list:
- Category tabs: All, Tutorial, Behind-the-Scenes, Industry, AI Video
- 2-col card grid: cover image (16/9 aspect), category tag, title in serif,
  excerpt, read time in mono, date
- Pagination: load more button (not infinite scroll)

Blog post:
- Hero: cover image full-width with gradient overlay, title in Cormorant 3.5rem
- Author row: avatar circle with initials, name, role, date, read time
- Body: max-width 680px centered, markdown-rendered
  → h2 = Cormorant 1.8rem, h3 = 1.4rem, p = 1rem leading-relaxed
  → blockquote: left border ember 3px, italic, gold text
  → code: DM Mono, bg ink-2, px-2 py-1
- Related posts: 3 cards at bottom
```

---

## ADMIN PORTFOLIO CRUD

```
Extend src/admin/PortfolioAdmin.tsx with full CRUD.

Table:
- Columns: Thumbnail (small square), Title, Category badge, Client, Featured toggle,
  Published toggle, Sort order drag handle, Actions (Edit, Delete)
- Inline toggle for featured and published (optimistic update to Supabase)
- Sort: drag-and-drop row reordering (update sort_order on drop)

Modal/drawer for create + edit:
- Fields: Title, Slug (auto-generated from title), Category select,
  Client name, Vimeo ID, YouTube ID, Description textarea,
  Results (key-value pairs, add/remove rows),
  Tags (comma-separated input), Featured checkbox, Published checkbox
- Image upload to Supabase Storage bucket "portfolio-thumbnails"
- Save = upsert to portfolio_items table

Design: dark modal bg ink-2, border border-white/8, close X top-right,
form uses existing form-input/form-label/form-select classes.
```

---

## QUOTE REQUESTS ADMIN — Full CRM view

```
Extend src/admin/QuoteRequests.tsx with status management.

Features:
- Filter bar: All | New | Contacted | Proposal Sent | Won | Lost
  → counts shown as badges per status
- Table: Name, Email, Company, Service, Budget, Status dropdown, Date, Notes button
- Status dropdown per row: inline select, on change = update Supabase status field
- Notes: click icon → inline editable text field → save to notes column
- Row click → expand accordion with full message text
- Export CSV button: downloads all visible rows as CSV
- Stats row top: total requests, new this week, conversion rate (won/total)

Color-coded status badges:
  new = blue/10 text-blue, contacted = amber, proposal_sent = purple,
  closed_won = green, closed_lost = red (all using ink bg with tinted text)
```

---

## SITE SETTINGS ADMIN

```
Build src/admin/SiteSettings.tsx.

Sections (tabs):
1. Hero — edit hero title, subtitle, cta labels (textarea + inputs)
2. Stats — edit 4 stat cards (number + label per card)
3. SEO — meta title, description, OG image URL
4. Contact — email, phone, address, social links (IG/LI/X/YT/FV)
5. SMTP — view SMTP settings reminder (link to .env, not editable in UI)

On save: upsert to site_settings table (key = section name, value = JSON).
Optimistic save with toast notification (react-hot-toast, dark style).
```

---

## REDIS SESSION / RATE LIMIT (API route, if adding server)

```
If adding an Express/Fastify API server layer:

Install ioredis. Connect with:
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'imba-redis',
    port: 6379,
    password: process.env.REDIS_PASSWORD,
  })

Use cases:
1. Rate limit quote form submissions: 3 per IP per hour
   Key: `ratelimit:quote:${ip}`, TTL: 3600
2. Cache portfolio items: 5min TTL
   Key: `cache:portfolio:${category}`, TTL: 300
3. Cache site_settings: 10min TTL
   Key: `cache:settings`, TTL: 600

Pattern:
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)
  const data = await supabase.from(...).select(...)
  await redis.setex(key, ttl, JSON.stringify(data))
  return data
```
