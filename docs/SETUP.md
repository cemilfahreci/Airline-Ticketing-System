# SE4458 Flight System — Setup Guide

This guide will help you set up all the required services for the Flight System.

## Prerequisites

- Node.js 18+
- npm
- Git

## Step 1: Clone and Install

```bash
git clone https://github.com/cemilfahreci/Airline-Ticketing-System.git
cd Airline-Ticketing-System

# Install all dependencies
cd gateway && npm install && cd ..
cd flight-service && npm install && cd ..
cd miles-service && npm install && cd ..
cd notification-service && npm install && cd ..
```

## Step 2: Supabase Setup

### 2.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and keys from Settings > API

### 2.2 Run Database Schema
1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the entire contents of `docs/schema.sql`
4. Paste and click **Run**
5. Verify tables are created in **Table Editor**

### 2.3 Configure Authentication Roles
For this project, we use Supabase Auth with custom user metadata for roles.

To create an ADMIN user:
1. Go to **Authentication** > **Users**
2. Click **Add User**
3. Enter email and password
4. After creating, click the user and add to **User Metadata**:
```json
{
  "role": "ADMIN"
}
```

To create a test user (customer):
1. Add a user without any role metadata (they're regular customers)

To create a SERVICE_OTHER_AIRLINE user:
```json
{
  "role": "SERVICE_OTHER_AIRLINE"
}
```

## Step 3: CloudAMQP Setup (RabbitMQ)

1. Go to [cloudamqp.com](https://www.cloudamqp.com)
2. Sign up for free "Little Lemur" plan
3. Create a new instance
4. Copy the AMQP URL from the instance details

## Step 4: Gmail SMTP Setup

1. Go to your Google Account settings
2. Enable 2-Factor Authentication
3. Go to Security > App Passwords
4. Generate a new app password for "Mail"
5. Save this 16-character password

## Step 5: Environment Variables

Create `.env` files in each service folder:

### gateway/.env
```
PORT=3000
FLIGHT_SERVICE_URL=http://localhost:3001
MILES_SERVICE_URL=http://localhost:3002
NOTIFICATION_SERVICE_URL=http://localhost:3003
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

### flight-service/.env
```
PORT=3001
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### miles-service/.env
```
PORT=3002
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SERVICE_API_KEY=your_secure_random_key_here
```

### notification-service/.env
```
PORT=3003
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
RABBITMQ_URL=amqps://your_cloudamqp_url
```

## Step 6: Run All Services

Open 4 terminal windows:

```bash
# Terminal 1: Gateway
cd gateway && npm run dev

# Terminal 2: Flight Service
cd flight-service && npm run dev

# Terminal 3: Miles Service
cd miles-service && npm run dev

# Terminal 4: Notification Service
cd notification-service && npm run dev
```

## Step 7: Verify Services

Test health endpoints:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/flights/health
curl http://localhost:3000/api/v1/miles/health
curl http://localhost:3000/api/v1/notifications/health
```

## Step 8: Get Auth Tokens

### Sign Up a User
```bash
curl -X POST 'https://zkuzdsolyrwlxyfkgwzp.supabase.co/auth/v1/signup' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Sign In (Get Token)
```bash
curl -X POST 'https://zkuzdsolyrwlxyfkgwzp.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

The response will contain `access_token` - use this as Bearer token.

### Use Token in Requests
```bash
curl http://localhost:3000/api/v1/admin/flights \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

## Troubleshooting

### "Failed to fetch" errors
- Ensure Supabase project is running
- Check your API keys are correct

### RabbitMQ connection failed
- Verify CloudAMQP URL is correct
- Service will retry connection automatically

### Email not sending
- Verify Gmail App Password is correct
- Check Gmail account has 2FA enabled

## API Endpoints Quick Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | None | Gateway health |
| `/api/v1/flights/airports` | GET | None | List airports |
| `/api/v1/flights/search` | GET | None | Search flights |
| `/api/v1/admin/flights` | POST | ADMIN | Create flight |
| `/api/v1/admin/flights` | GET | ADMIN | List all flights |
| `/api/v1/tickets/buy` | POST | Optional | Buy ticket |
| `/api/v1/miles/members` | POST | None | Create membership |
| `/api/v1/miles/add` | POST | Service Key | Partner miles credit |
