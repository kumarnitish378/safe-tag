# SafeTag — Deployment Guide

> Covers **Render.com** (primary), **Railway.app** (alternative), and **Ubuntu VPS** (self-hosted).  
> Production database: **PostgreSQL**. Dev database: SQLite (no setup needed).

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.x | `node -v` to verify |
| npm | ≥ 10.x | Bundled with Node 20 |
| Git | any | Must push to remote |
| PostgreSQL | 14+ | Only for production |
| Razorpay account | — | Optional if `DUMMY_PAYMENT=true` |
| SMTP credentials | — | For order confirmation emails |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before deploying.

| Variable | Required | Example / Default | Description |
|---|---|---|---|
| `NODE_SESSION_SECRET` | **Yes** | 64-char hex string | Session signing key — use `openssl rand -hex 32` |
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@host:5432/safetag` | PostgreSQL connection string |
| `PORT` | No | `3000` | HTTP port (Render sets this automatically) |
| `BASE_URL` | **Yes** | `https://safe-tag.in` | Full domain — used in QR codes and emails |
| `NODE_ENV` | **Yes** | `production` | Enables security hardening |
| `DUMMY_PAYMENT` | No | `false` | Set `true` to skip Razorpay in staging |
| `RAZORPAY_KEY_ID` | If paying | `rzp_live_xxx` | Razorpay dashboard → API Keys |
| `RAZORPAY_KEY_SECRET` | If paying | `xxx` | Razorpay dashboard → API Keys |
| `SMTP_HOST` | No | `smtp.gmail.com` | For order emails |
| `SMTP_PORT` | No | `587` | TLS port |
| `SMTP_USER` | No | `your@gmail.com` | SMTP sender address |
| `SMTP_PASS` | No | `app-password` | Gmail App Password (not account password) |
| `ADMIN_EMAIL` | No | `admin@safe-tag.in` | Receives low-stock / error alerts |

> **Never commit `.env` to git.** It is in `.gitignore`.

---

## Option A — Render.com (Recommended)

Render gives you a free PostgreSQL database and auto-deploys from GitHub.

### Step 1 — Push your code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/safe-tag.git
git push -u origin main
```

### Step 2 — Create a PostgreSQL database on Render

1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click **New → PostgreSQL**
3. Name it `safetag-db`
4. Select region: **Singapore** (closest to India)
5. Plan: **Free** (1 GB, enough for launch)
6. Click **Create Database**
7. Copy the **Internal Database URL** — you'll need it in Step 4

### Step 3 — Create a Web Service on Render

1. Click **New → Web Service**
2. Connect your GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `safetag` |
| **Region** | Singapore |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install && npx prisma generate && npx prisma migrate deploy` |
| **Start Command** | `node server.js` |
| **Plan** | Free (or Starter for always-on) |

### Step 4 — Set Environment Variables on Render

In your Web Service → **Environment** tab, add:

```
NODE_ENV=production
NODE_SESSION_SECRET=<output of: openssl rand -hex 32>
DATABASE_URL=<Internal Database URL from Step 2>
BASE_URL=https://safetag.onrender.com
DUMMY_PAYMENT=false
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=admin@safe-tag.in
```

> After entering all variables, click **Save Changes** — Render will redeploy automatically.

### Step 5 — Verify Deployment

```bash
# Check build logs in Render dashboard — look for:
# "Prisma migrate deploy: No pending migrations"
# "Server listening on port 3000"

# Test key URLs:
curl https://safetag.onrender.com/
curl https://safetag.onrender.com/store
curl https://safetag.onrender.com/TESTACT1/testkey00001
```

### Step 6 — Add Custom Domain (optional but recommended)

1. Render Web Service → **Settings → Custom Domains**
2. Add `safe-tag.in` and `www.safe-tag.in`
3. In your DNS registrar, add:
   ```
   A     @    216.24.57.1        (Render's IP — check dashboard)
   CNAME www  safetag.onrender.com.
   ```
4. SSL certificate is issued automatically by Render (Let's Encrypt)
5. Update `BASE_URL` environment variable to `https://safe-tag.in`

---

## Option B — Railway.app

### Step 1 — Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Step 2 — Create Project

```bash
cd safe-tag
railway init          # creates new project
railway add           # add PostgreSQL plugin
```

### Step 3 — Set Environment Variables

```bash
railway variables set NODE_ENV=production
railway variables set NODE_SESSION_SECRET=$(openssl rand -hex 32)
railway variables set BASE_URL=https://YOUR_APP.up.railway.app
railway variables set DUMMY_PAYMENT=false
railway variables set RAZORPAY_KEY_ID=rzp_live_xxx
railway variables set RAZORPAY_KEY_SECRET=xxx
# DATABASE_URL is injected automatically from the PostgreSQL plugin
```

### Step 4 — Deploy

```bash
railway up
```

Railway auto-detects Node.js. Build command and start command are read from `package.json`.

> Add this to `package.json` scripts if not present:
> ```json
> "build": "npx prisma generate && npx prisma migrate deploy"
> ```

---

## Option C — Ubuntu VPS (Self-hosted)

Use this for full control (Hetzner, DigitalOcean, AWS EC2, etc.).

### Step 1 — Server setup

```bash
# SSH into your VPS
ssh root@YOUR_SERVER_IP

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install PM2 (process manager)
npm install -g pm2

# Install nginx (reverse proxy)
apt install -y nginx certbot python3-certbot-nginx
```

### Step 2 — Create PostgreSQL database

```bash
sudo -u postgres psql

# Inside psql:
CREATE USER safetag WITH PASSWORD 'StrongPassword123!';
CREATE DATABASE safetag_prod OWNER safetag;
GRANT ALL PRIVILEGES ON DATABASE safetag_prod TO safetag;
\q
```

### Step 3 — Clone and configure

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/safe-tag.git
cd safe-tag

# Create .env
cp .env.example .env
nano .env
# Fill in all variables — DATABASE_URL should be:
# postgresql://safetag:StrongPassword123!@localhost:5432/safetag_prod
```

### Step 4 — Install and migrate

```bash
npm install --production
npx prisma generate
npx prisma migrate deploy
```

### Step 5 — Start with PM2

```bash
pm2 start server.js --name safetag
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot
```

### Step 6 — Configure nginx

```bash
nano /etc/nginx/sites-available/safetag
```

Paste:

```nginx
server {
    listen 80;
    server_name safe-tag.in www.safe-tag.in;

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

    client_max_body_size 10M;
}
```

```bash
ln -s /etc/nginx/sites-available/safetag /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# SSL with Let's Encrypt
certbot --nginx -d safe-tag.in -d www.safe-tag.in
```

### Step 7 — Auto-deploy on git push (optional)

```bash
# Add a post-receive git hook on server
cd /var/www/safe-tag
git remote add deploy root@YOUR_SERVER_IP:/var/www/safe-tag

# On server, create hook:
nano .git/hooks/post-receive
```

```bash
#!/bin/bash
cd /var/www/safe-tag
git pull
npm install --production
npx prisma migrate deploy
pm2 restart safetag
```

```bash
chmod +x .git/hooks/post-receive
```

Now `git push deploy main` deploys automatically.

---

## Database Migration Commands

```bash
# Apply pending migrations (production — never use migrate dev in prod)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Open Prisma Studio (visual DB browser) — dev only
npm run db:studio

# Re-seed database (dev only — WARNING: adds test data)
npx prisma db seed

# Reset database completely (dev only — DESTRUCTIVE)
npx prisma migrate reset
```

---

## Post-Deployment Checklist

### Security
- [ ] `NODE_SESSION_SECRET` is a random 64-char hex string (not the example value)
- [ ] `NODE_ENV=production` is set
- [ ] `.env` is NOT committed to git
- [ ] HTTPS is active (SSL certificate issued)
- [ ] Razorpay keys are `rzp_live_*` (not test keys)

### Functionality
- [ ] Homepage loads: `GET /`
- [ ] Store loads: `GET /store`
- [ ] Admin login works: `POST /login` with admin credentials
- [ ] Tag scan works: `GET /TESTACT1/testkey00001`
- [ ] Emergency page loads: `GET /emergency/TESTACT1`
- [ ] Checkout flow completes (COD order)
- [ ] Order shows in admin dashboard: `GET /admin/orders`
- [ ] QR download works: `GET /qr/TESTACT1`
- [ ] Email notification sent on order (check SMTP)

### Content
- [ ] Test tags (`TESTACT1`, `TESTINAC`) removed from production DB
- [ ] `BASE_URL` matches live domain exactly (used in QR codes)
- [ ] Product listings created and approved by admin
- [ ] Admin account password changed from default

### Performance
- [ ] Static files served correctly (`/static/images/`, `/static/css/`)
- [ ] Node.js process restarts automatically on crash (PM2 or Render auto-restart)
- [ ] Database connection pooling working (Prisma handles this automatically)

---

## Monitoring & Maintenance

### Check server health (VPS)

```bash
pm2 status           # process status
pm2 logs safetag     # real-time logs
pm2 monit            # live CPU/RAM dashboard
```

### Useful npm scripts

```bash
npm start            # start server
npm run db:studio    # open Prisma Studio at http://localhost:5555
npm run db:migrate   # create + apply new migration (dev)
npm run db:seed      # re-seed dev database
```

### Database backup (PostgreSQL)

```bash
# Backup
pg_dump -U safetag safetag_prod > backup_$(date +%Y%m%d).sql

# Restore
psql -U safetag safetag_prod < backup_20240101.sql
```

### Update the app

```bash
git pull origin main
npm install
npx prisma migrate deploy
pm2 restart safetag   # or Render auto-deploys on push
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `PrismaClientInitializationError` | Wrong `DATABASE_URL` | Check connection string format |
| `P3005: database schema is not empty` | Running `migrate dev` on existing DB | Use `migrate deploy` in production |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL not running | `systemctl start postgresql` |
| `Invalid CSRF token` | Session secret changed mid-session | Users must re-login; clear old sessions |
| QR images return 404 | `BASE_URL` wrong | Update env var to match live domain |
| Razorpay `AUTHENTICATION_FAILED` | Wrong API keys | Check live vs test key mismatch |
| Port 3000 already in use | Another process on port | `lsof -i :3000` then kill PID |
| `SESSION_SECRET` too short | Default example value used | Generate: `openssl rand -hex 32` |

---

*SafeTag — SDD v3.0 · Made in India*
