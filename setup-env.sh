#!/bin/bash

# SE4458 Flight System - Environment Setup Script
# Run this script to create all .env files

echo "🚀 Creating .env files for Flight System..."

# Gateway .env
cat > gateway/.env << 'EOF'
PORT=3000
FLIGHT_SERVICE_URL=http://localhost:3001
MILES_SERVICE_URL=http://localhost:3002
NOTIFICATION_SERVICE_URL=http://localhost:3003

# Supabase
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk
EOF
echo "✅ gateway/.env created"

# Flight Service .env
cat > flight-service/.env << 'EOF'
PORT=3001

# Supabase
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAyMDcxMiwiZXhwIjoyMDgzNTk2NzEyfQ.PLACEHOLDER_GET_FROM_SUPABASE
EOF
echo "✅ flight-service/.env created"

# Miles Service .env
cat > miles-service/.env << 'EOF'
PORT=3002

# Supabase
SUPABASE_URL=https://zkuzdsolyrwlxyfkgwzp.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAyMDcxMiwiZXhwIjoyMDgzNTk2NzEyfQ.PLACEHOLDER_GET_FROM_SUPABASE

# Service API Key (for partner airlines)
SERVICE_API_KEY=se4458_flight_system_secret_key_2024

# Notification Service URL
NOTIFICATION_SERVICE_URL=http://localhost:3003
EOF
echo "✅ miles-service/.env created"

# Notification Service .env
cat > notification-service/.env << 'EOF'
PORT=3003

# Gmail SMTP
GMAIL_USER=cemilfahreci@gmail.com
GMAIL_APP_PASSWORD=clnifwawlhiretdk

# RabbitMQ (CloudAMQP)
RABBITMQ_URL=amqps://racqxvcy:vDltr7wrn9jQwLJRr_IJh9aFe3emIZ7P@cow.rmq2.cloudamqp.com/racqxvcy
EOF
echo "✅ notification-service/.env created"

echo ""
echo "🎉 All .env files created!"
echo ""
echo "⚠️  IMPORTANT: You need to get the SUPABASE_SERVICE_ROLE_KEY from:"
echo "   https://supabase.com/dashboard/project/zkuzdsolyrwlxyfkgwzp/settings/api"
echo "   Look for 'service_role' key (keep it secret!)"
echo ""
echo "Then update flight-service/.env and miles-service/.env with the real key."
