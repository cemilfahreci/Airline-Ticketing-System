#!/bin/bash
echo "🛑 Stopping old processes..."
pkill -f "node src/index.js"
pkill -f "vite"
sleep 2

echo "🚀 Starting Flight Service on port 3001..."
(cd flight-service && PORT=3001 node src/index.js > ../flight.log 2>&1 &)

echo "🚀 Starting Miles Service on port 3002..."
(cd miles-service && PORT=3002 node src/index.js > ../miles.log 2>&1 &)

echo "🚀 Starting Notification Service on port 3003..."
(cd notification-service && PORT=3003 node src/index.js > ../notification.log 2>&1 &)

sleep 2

echo "🚀 Starting Gateway on port 3000..."
(cd gateway && PORT=3000 node src/index.js > ../gateway.log 2>&1 &)

echo "🚀 Starting Admin UI..."
(cd ui-admin && npm run dev > ../ui-admin.log 2>&1 &)

echo "🚀 Starting Customer UI..."
(cd ui-customer && npm run dev > ../ui-customer.log 2>&1 &)

echo "✅ All services launched! Please wait 5-10 seconds for them to initialize."
echo "Admin UI: http://localhost:5173"
echo "Customer UI: http://localhost:5174"
echo "Gateway API: http://localhost:3000"
