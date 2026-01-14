# Deployment Guide — Vercel + Render

This guide deploys the Airline Ticketing System using:
- **Vercel** for frontend (ui-customer, ui-admin)
- **Render** for backend services (gateway, flight-service, miles-service, notification-service)

---

## Prerequisites

1. GitHub repository with your code pushed
2. Accounts on:
   - [Vercel](https://vercel.com)
   - [Render](https://render.com)
3. Existing cloud services:
   - Supabase project (already configured)
   - CloudAMQP (RabbitMQ)
   - Redis provider (Upstash recommended)

---

## Step 1: Deploy Backend Services on Render

### 1.1 Create Render Services

For each service (gateway, flight-service, miles-service, notification-service):

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `airline-gateway` (or appropriate name)
   - **Root Directory**: `gateway` (or service path)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 1.2 Environment Variables (Render)

**Gateway:**
```
PORT=3000
FLIGHT_SERVICE_URL=https://airline-flight-service.onrender.com
MILES_SERVICE_URL=https://airline-miles-service.onrender.com
NOTIFICATION_SERVICE_URL=https://airline-notification-service.onrender.com
ALLOWED_ORIGINS=https://your-customer-ui.vercel.app,https://your-admin-ui.vercel.app
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

**Flight Service:**
```
PORT=3001
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://default:xxx@your-redis-host:6379
RABBITMQ_URL=amqps://xxx:xxx@your-cloudamqp-host/xxx
```

**Miles Service:**
```
PORT=3002
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RABBITMQ_URL=amqps://xxx:xxx@your-cloudamqp-host/xxx
SERVICE_API_KEY=your-secure-random-key
```

**Notification Service:**
```
PORT=3003
RABBITMQ_URL=amqps://xxx:xxx@your-cloudamqp-host/xxx
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

---

## Step 2: Deploy Frontend on Vercel

### 2.1 Deploy Customer UI

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your repository
4. Configure:
   - **Root Directory**: `ui-customer`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. Add Environment Variables:
   ```
   VITE_API_URL=https://airline-gateway.onrender.com
   VITE_SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

6. Click **Deploy**

### 2.2 Deploy Admin UI

Repeat the same steps for `ui-admin` directory.

---

## Step 3: Update CORS Origins

After both Vercel apps are deployed, update the Gateway's `ALLOWED_ORIGINS`:

```
ALLOWED_ORIGINS=https://your-customer-ui.vercel.app,https://your-admin-ui.vercel.app
```

Trigger a redeploy on Render.

---

## Step 4: Configure Supabase

1. Go to Supabase → Authentication → URL Configuration
2. Add Redirect URLs:
   - `https://your-customer-ui.vercel.app/**`
   - `https://your-admin-ui.vercel.app/**`

---

## Verification

1. ✅ Visit Customer UI → Search for flights → Book a ticket
2. ✅ Visit Admin UI → Login with admin user → Add a flight
3. ✅ Check email delivery for booking confirmation
4. ✅ Test Miles&Smiles registration and points display

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CORS errors | Check `ALLOWED_ORIGINS` includes your Vercel URLs |
| API 502 errors | Check Render service logs, ensure all env vars set |
| Login fails | Verify Supabase redirect URLs are configured |
| Emails not sent | Check GMAIL_APP_PASSWORD and Gmail account settings |

---

## Cost Estimate (Free Tier)

- **Vercel**: Free (hobby plan)
- **Render**: Free tier (spins down after inactivity)
- **Supabase**: Free tier (500MB database)
- **CloudAMQP**: Free tier (1M messages/month)
- **Upstash Redis**: Free tier (10K commands/day)

> ⚠️ Render free tier services spin down after 15 minutes of inactivity. First request after spin-down may take 30-60 seconds.
