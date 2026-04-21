# Imba Production — Web Platform

Cinematic video production agency website with full self-hosted CMS.

**Stack:** Vite + React + TypeScript + Supabase (self-hosted) + Redis + nginx  
**Deploy:** Coolify on Hetzner · Reverse proxy via Plesk/Traefik

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Hetzner VPS  (Coolify managed)                     │
│                                                     │
│  ┌────────────┐    ┌──────────────────────────────┐ │
│  │  Traefik   │    │  imba-web (nginx + React SPA)│ │
│  │  (SSL/TLS) │───▶│  imbaproduction.com          │ │
│  └─────┬──────┘    └──────────────────────────────┘ │
│        │                                            │
│        │           ┌──────────────────────────────┐ │
│        └──────────▶│  supabase-kong               │ │
│                    │  supabase.imbaproduction.com  │ │
│                    │  ├── GoTrue (auth :9999)      │ │
│                    │  ├── PostgREST (api :3001)    │ │
│                    │  └── Storage (:5000)          │ │
│                    └────────────┬─────────────────┘ │
│                                 │                   │
│  ┌──────────────┐  ┌────────────▼─────────────────┐ │
│  │ Redis :6379  │  │  PostgreSQL :5432            │ │
│  │ (cache/sess) │  │  (Supabase-compatible)       │ │
│  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Quick Deploy to Coolify

### 1. Connect repo

In Coolify → New Resource → Application → GitHub → `magnetoid/woopulse-web`  
Build pack: **Docker Compose**  
Compose file: `docker-compose.yml`

### 2. Generate JWT keys

```bash
# Install supabase CLI or use jwt.io
# JWT_SECRET — random 32+ char string
openssl rand -base64 32

# Generate anon key (role: anon, exp: far future)
# Generate service_role key (role: service_role)
# Use: https://supabase.com/docs/guides/self-hosting#api-keys
```

Or use the Supabase JWT generator script:
```bash
node scripts/generate-jwt-keys.js
```

### 3. Set environment variables in Coolify

Copy `.env.example` → paste all vars into Coolify's env UI.  
**Critical vars:**

| Variable | Description |
|---|---|
| `JWT_SECRET` | 32+ char random string |
| `SUPABASE_ANON_KEY` | JWT with role=anon |
| `SUPABASE_SERVICE_KEY` | JWT with role=service_role |
| `VITE_SUPABASE_URL` | `https://supabase.yourdomain.com` |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY |
| `POSTGRES_PASSWORD` | Strong password |
| `REDIS_PASSWORD` | Strong password |
| `APP_DOMAIN` | `imbaproduction.com` |
| `SUPABASE_DOMAIN` | `supabase.imbaproduction.com` |

### 4. DNS records (on your domain)

```
A  imbaproduction.com          → your-hetzner-ip
A  supabase.imbaproduction.com → your-hetzner-ip
A  studio.imbaproduction.com   → your-hetzner-ip
```

### 5. Plesk reverse proxy (if using Plesk as outer proxy)

In Plesk → Domains → imbaproduction.com → Apache & nginx Settings:

```nginx
# Additional nginx directives
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

### 6. Deploy

```bash
# Coolify triggers on git push to main
git push origin main

# Or manually trigger in Coolify dashboard
```

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/magnetoid/woopulse-web.git
cd woopulse-web

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Fill in your Supabase cloud or local values

# 4. Start Supabase + Redis locally (optional)
docker compose up supabase-db redis -d

# 5. Run migrations
# Wait for DB to be healthy, then:
docker exec -i imba-supabase-db psql -U supabase -d imba_production < scripts/init.sql

# 6. Dev server
npm run dev
# → http://localhost:3000
```

---

## Admin Panel

URL: `https://imbaproduction.com/admin`

Login with Supabase Auth credentials.  
Create first admin user:
```bash
# In Supabase Studio or via SQL:
# studio.imbaproduction.com → Authentication → Users → Invite User
```

Or via SQL directly:
```sql
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, role)
VALUES ('admin@imbaproduction.com', crypt('yourpassword', gen_salt('bf')), NOW(), 'authenticated');
```

---

## CMS Content Types

| Type | Table | Public read | Admin write |
|---|---|---|---|
| Portfolio items | `portfolio_items` | ✅ published only | ✅ |
| Blog posts | `blog_posts` | ✅ published only | ✅ |
| Services | `services` | ✅ published only | ✅ |
| Testimonials | `testimonials` | ✅ published only | ✅ |
| Team members | `team_members` | ✅ published only | ✅ |
| Quote requests | `quote_requests` | INSERT only | ✅ |
| Site settings | `site_settings` | ✅ | ✅ |

---

## Extend in Trae AI

See vibe coding prompts in `scripts/vibe-prompts.md` for each section.

---

## Tech Stack

- **Frontend:** Vite 5 · React 18 · TypeScript · TailwindCSS
- **Backend:** Supabase (PostgreSQL + PostgREST + GoTrue + Storage)
- **Cache:** Redis 7 (session cache, rate limiting)
- **Gateway:** Kong 2.8 (API routing)
- **Serve:** nginx 1.25 (SPA + static assets)
- **Deploy:** Docker Compose · Coolify · Hetzner
- **Fonts:** Cormorant Garamond · DM Mono
