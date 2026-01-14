/**
 * ML Model Training Data Seeder
 * Seeds airports and flights used for ML model training
 * 
 * Usage: node seed_ml_training_data.js
 */

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@flightsystem.com';
const ADMIN_PASSWORD = 'password123';
const SUPABASE_URL = 'https://zkuzdsolyrwlxyfkgwzp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const SUPABASE_AUTH_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

// All airports used in ML model training
const airports = [
    // Turkey
    { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', latitude: 41.2753, longitude: 28.7519 },
    { code: 'SAW', name: 'Sabiha Gökçen Airport', city: 'Istanbul', country: 'Turkey', latitude: 40.8986, longitude: 29.3092 },
    { code: 'AYT', name: 'Antalya Airport', city: 'Antalya', country: 'Turkey', latitude: 36.8987, longitude: 30.8005 },
    { code: 'ADB', name: 'Adnan Menderes Airport', city: 'Izmir', country: 'Turkey', latitude: 38.2922, longitude: 27.1569 },
    { code: 'ESB', name: 'Esenboğa Airport', city: 'Ankara', country: 'Turkey', latitude: 40.1281, longitude: 32.9951 },
    
    // USA
    { code: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'USA', latitude: 40.6413, longitude: -73.7781 },
    { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA', latitude: 33.9416, longitude: -118.4085 },
    { code: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'USA', latitude: 37.6213, longitude: -122.3790 },
    { code: 'MIA', name: 'Miami International', city: 'Miami', country: 'USA', latitude: 25.7959, longitude: -80.2870 },
    { code: 'ORD', name: 'O\'Hare International', city: 'Chicago', country: 'USA', latitude: 41.9742, longitude: -87.9073 },
    { code: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas', country: 'USA', latitude: 32.8998, longitude: -97.0403 },
    
    // Europe
    { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'UK', latitude: 51.4700, longitude: -0.4543 },
    { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France', latitude: 49.0097, longitude: 2.5479 },
    { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', latitude: 50.0379, longitude: 8.5622 },
    { code: 'AMS', name: 'Schiphol Airport', city: 'Amsterdam', country: 'Netherlands', latitude: 52.3105, longitude: 4.7683 },
    { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'Spain', latitude: 40.4839, longitude: -3.5680 },
    { code: 'FCO', name: 'Leonardo da Vinci-Fiumicino', city: 'Rome', country: 'Italy', latitude: 41.8003, longitude: 12.2389 },
    { code: 'VIE', name: 'Vienna International', city: 'Vienna', country: 'Austria', latitude: 48.1103, longitude: 16.5697 },
    { code: 'ZUR', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', latitude: 47.4647, longitude: 8.5492 },
    { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark', latitude: 55.6180, longitude: 12.6500 },
    
    // Middle East
    { code: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'UAE', latitude: 25.2532, longitude: 55.3657 },
    { code: 'AUH', name: 'Abu Dhabi International', city: 'Abu Dhabi', country: 'UAE', latitude: 24.4330, longitude: 54.6511 },
    { code: 'DOH', name: 'Hamad International', city: 'Doha', country: 'Qatar', latitude: 25.2611, longitude: 51.5651 },
    { code: 'RUH', name: 'King Khalid International', city: 'Riyadh', country: 'Saudi Arabia', latitude: 24.9576, longitude: 46.6988 },
    
    // Asia
    { code: 'SIN', name: 'Changi Airport', city: 'Singapore', country: 'Singapore', latitude: 1.3644, longitude: 103.9915 },
    { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', latitude: 13.6811, longitude: 100.7473 },
    { code: 'HKG', name: 'Hong Kong International', city: 'Hong Kong', country: 'Hong Kong', latitude: 22.3080, longitude: 113.9185 },
    { code: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'Japan', latitude: 35.7720, longitude: 140.3929 },
    { code: 'ICN', name: 'Incheon International', city: 'Seoul', country: 'South Korea', latitude: 37.4602, longitude: 126.4407 },
    { code: 'PEK', name: 'Beijing Capital International', city: 'Beijing', country: 'China', latitude: 40.0801, longitude: 116.5845 },
    { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj', city: 'Mumbai', country: 'India', latitude: 19.0896, longitude: 72.8656 },
    { code: 'DEL', name: 'Indira Gandhi International', city: 'New Delhi', country: 'India', latitude: 28.5562, longitude: 77.1000 },
];

// Popular routes - ONLY using airports that exist in DB
// Based on check: IST, SAW, AYT, ADB, ESB, JFK, LHR, CDG, FRA, DXB exist
const popularRoutes = [
    // Turkey routes (all exist)
    { origin: 'IST', dest: 'DXB', distance: 3100, minPrice: 320, maxPrice: 450, duration: 240 },
    { origin: 'IST', dest: 'JFK', distance: 7800, minPrice: 650, maxPrice: 1200, duration: 600 },
    { origin: 'IST', dest: 'LHR', distance: 2500, minPrice: 250, maxPrice: 500, duration: 240 },
    { origin: 'IST', dest: 'AYT', distance: 480, minPrice: 60, maxPrice: 150, duration: 75 },
    { origin: 'IST', dest: 'FRA', distance: 1900, minPrice: 200, maxPrice: 400, duration: 195 },
    { origin: 'IST', dest: 'CDG', distance: 2400, minPrice: 240, maxPrice: 480, duration: 225 },
    { origin: 'SAW', dest: 'DXB', distance: 3100, minPrice: 330, maxPrice: 460, duration: 245 },
    { origin: 'SAW', dest: 'IST', distance: 35, minPrice: 40, maxPrice: 80, duration: 45 },
    { origin: 'IST', dest: 'ADB', distance: 350, minPrice: 55, maxPrice: 120, duration: 65 },
    { origin: 'IST', dest: 'ESB', distance: 350, minPrice: 50, maxPrice: 110, duration: 60 },
    { origin: 'AYT', dest: 'IST', distance: 480, minPrice: 60, maxPrice: 150, duration: 75 },
    { origin: 'ADB', dest: 'IST', distance: 350, minPrice: 55, maxPrice: 120, duration: 65 },
    { origin: 'ESB', dest: 'IST', distance: 350, minPrice: 50, maxPrice: 110, duration: 60 },
    
    // Europe routes (all exist)
    { origin: 'LHR', dest: 'CDG', distance: 340, minPrice: 100, maxPrice: 250, duration: 75 },
    { origin: 'LHR', dest: 'FRA', distance: 650, minPrice: 120, maxPrice: 280, duration: 90 },
    { origin: 'LHR', dest: 'IST', distance: 2500, minPrice: 250, maxPrice: 500, duration: 240 },
    { origin: 'CDG', dest: 'FRA', distance: 450, minPrice: 130, maxPrice: 300, duration: 85 },
    { origin: 'CDG', dest: 'IST', distance: 2400, minPrice: 240, maxPrice: 480, duration: 225 },
    { origin: 'FRA', dest: 'IST', distance: 1900, minPrice: 200, maxPrice: 400, duration: 195 },
    { origin: 'FRA', dest: 'LHR', distance: 650, minPrice: 120, maxPrice: 280, duration: 90 },
    
    // Middle East routes (DXB exists)
    { origin: 'DXB', dest: 'LHR', distance: 5500, minPrice: 500, maxPrice: 900, duration: 420 },
    { origin: 'DXB', dest: 'IST', distance: 3100, minPrice: 320, maxPrice: 450, duration: 240 },
    { origin: 'DXB', dest: 'JFK', distance: 11000, minPrice: 800, maxPrice: 1400, duration: 780 },
    
    // US routes (JFK exists)
    { origin: 'JFK', dest: 'IST', distance: 7800, minPrice: 650, maxPrice: 1200, duration: 600 },
    { origin: 'JFK', dest: 'LHR', distance: 5500, minPrice: 500, maxPrice: 900, duration: 420 },
    { origin: 'JFK', dest: 'DXB', distance: 11000, minPrice: 800, maxPrice: 1400, duration: 780 },
];

const airlines = ['TK', 'AA', 'LH', 'EK', 'BA', 'AF', 'DL', 'UA', 'EK', 'SQ', 'CX', 'JL'];

function getFutureDate(daysFromNow, hour, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
}

function addMinutes(dateStr, minutes) {
    const d = new Date(dateStr);
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
}

function generateFlights(count = 300) {
    const flights = [];
    const now = new Date();
    
    for (let i = 0; i < count; i++) {
        // Random route
        const route = popularRoutes[Math.floor(Math.random() * popularRoutes.length)];
        
        // Random date in next 90 days
        const daysAhead = Math.floor(Math.random() * 90);
        const departureDate = new Date(now);
        departureDate.setDate(departureDate.getDate() + daysAhead);
        
        // Random departure hour (prefer peak hours 60% of the time)
        let hour;
        if (Math.random() < 0.6) {
            // Peak hours: 6-9am or 5-8pm
            if (Math.random() < 0.5) {
                hour = Math.floor(Math.random() * 4) + 6; // 6-9
            } else {
                hour = Math.floor(Math.random() * 4) + 17; // 17-20
            }
        } else {
            hour = Math.floor(Math.random() * 24);
        }
        
        const minute = Math.floor(Math.random() * 60);
        departureDate.setHours(hour, minute, 0, 0);
        
        // Duration with some variation
        const durationVariation = Math.floor(Math.random() * 30) - 15;
        const durationMinutes = Math.max(60, route.duration + durationVariation);
        
        // Arrival time
        const arrivalDate = new Date(departureDate);
        arrivalDate.setMinutes(arrivalDate.getMinutes() + durationMinutes);
        
        // Capacity (typical aircraft sizes)
        const capacities = [120, 150, 180, 220, 300, 350];
        const totalCapacity = capacities[Math.floor(Math.random() * capacities.length)];
        const availableCapacity = Math.floor(totalCapacity * (0.2 + Math.random() * 0.7));
        
        // Price calculation with variations
        const dayOfWeek = departureDate.getDay();
        const month = departureDate.getMonth();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isBusyMonth = month === 0 || month === 6 || month === 7 || month === 11; // Jan, Jul, Aug, Dec
        const isPeakHour = (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20);
        const isLastMinute = daysAhead < 7;
        const isAdvance = daysAhead > 14;
        
        let priceMultiplier = 1.0;
        if (isWeekend) priceMultiplier *= 1.12;
        if (isBusyMonth) priceMultiplier *= 1.20;
        if (isPeakHour) priceMultiplier *= 1.15;
        if (isLastMinute) priceMultiplier *= (1.5 - (daysAhead / 7) * 0.3);
        if (isAdvance) priceMultiplier *= (1 - Math.min(0.25, (daysAhead - 14) * 0.01));
        
        const basePrice = route.minPrice + (route.maxPrice - route.minPrice) * Math.random();
        const finalPrice = Math.round(basePrice * priceMultiplier * 100) / 100;
        
        // Flight number
        const airline = airlines[Math.floor(Math.random() * airlines.length)];
        const flightNumber = `${airline}${Math.floor(Math.random() * 9000) + 1000}`;
        
        // Is direct (70% chance)
        const isDirect = Math.random() < 0.7;
        
        flights.push({
            flight_number: flightNumber,
            origin_airport_code: route.origin,
            destination_airport_code: route.dest,
            departure_time: departureDate.toISOString(),
            arrival_time: arrivalDate.toISOString(),
            duration_minutes: durationMinutes,
            total_capacity: totalCapacity,
            available_capacity: availableCapacity,
            base_price: finalPrice,
            is_direct: isDirect
        });
    }
    
    return flights;
}

async function seedAirports(accessToken) {
    console.log('🏢 Checking existing airports...');
    
    // Check which airports exist via API
    try {
        const res = await fetch(`${BASE_URL}/api/v1/flights/airports`);
        const data = await res.json();
        const existingAirports = data.airports || [];
        
        console.log(`   ✅ Found ${existingAirports.length} existing airports`);
        if (existingAirports.length > 0) {
            const codes = existingAirports.slice(0, 10).map(a => a.code).join(', ');
            console.log(`   Sample: ${codes}${existingAirports.length > 10 ? '...' : ''}`);
        }
        
        // Note: Airports can't be added via REST API due to RLS
        // They need to be added via Supabase Dashboard SQL Editor or service role
        console.log(`   ⚠️  To add more airports, use Supabase Dashboard SQL Editor\n`);
        
        return existingAirports.length > 0;
    } catch (e) {
        console.error(`   ❌ Error checking airports:`, e.message);
        return false;
    }
}

async function seedFlights(accessToken) {
    console.log('✈️  Generating flights...');
    const flights = generateFlights(300); // Generate 300 flights with existing airports only
    console.log(`📦 Generated ${flights.length} flights\n`);
    
    console.log('🚀 Adding flights to database...');
    let added = 0;
    let skipped = 0;
    let failed = 0;
    
    // Process in batches with timeout
    const BATCH_SIZE = 10;
    const REQUEST_TIMEOUT = 10000; // 10 seconds per request
    
    for (let i = 0; i < flights.length; i += BATCH_SIZE) {
        const batch = flights.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (flight) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
                
                const res = await fetch(`${BASE_URL}/api/v1/admin/flights`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify(flight),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    added++;
                    return { success: true };
                } else {
                    const err = await res.text();
                    if (err.includes('duplicate') || err.includes('already exists') || err.includes('23505')) {
                        skipped++;
                        return { success: true, skipped: true };
                    } else {
                        failed++;
                        if (failed <= 3) {
                            console.error(`   ❌ Failed: ${flight.flight_number}:`, err.substring(0, 80));
                        }
                        return { success: false };
                    }
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    failed++;
                    return { success: false, timeout: true };
                }
                failed++;
                if (failed <= 3) {
                    console.error(`   ❌ Error: ${flight.flight_number}:`, e.message);
                }
                return { success: false };
            }
        });
        
        await Promise.all(batchPromises);
        
        if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= flights.length) {
            console.log(`   ✅ Progress: ${Math.min(i + BATCH_SIZE, flights.length)}/${flights.length} processed (${added} added, ${skipped} skipped, ${failed} failed)`);
        }
    }
    
    console.log(`\n✅ Flights: ${added} added, ${skipped} skipped, ${failed} failed\n`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('ML TRAINING DATA SEEDER');
    console.log('='.repeat(60));
    console.log();
    
    // 1. Login as admin first (needed for flights)
    console.log('🔑 Logging in as Admin...');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    const loginRes = await fetch(SUPABASE_AUTH_URL, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        })
    });
    
    if (!loginRes.ok) {
        const err = await loginRes.text();
        console.error('❌ Login failed:', err);
        console.log('\n💡 Make sure you have an admin user with:');
        console.log(`   Email: ${ADMIN_EMAIL}`);
        console.log(`   Password: ${ADMIN_PASSWORD}`);
        console.log('   Role: ADMIN (in user_metadata)');
        return;
    }
    
    const { access_token } = await loginRes.json();
    console.log('✅ Login successful!\n');
    
    // 2. Seed airports
    const airportsSeeded = await seedAirports(access_token);
    
    if (!airportsSeeded) {
        console.log('⚠️  No airports were added. Continuing anyway...\n');
    }
    
    // 3. Seed flights
    await seedFlights(access_token);
    
    console.log('='.repeat(60));
    console.log('✨ SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n👉 Go to Customer UI http://localhost:5174 to search for flights');
    console.log('👉 Go to Admin UI http://localhost:5173 to view all flights');
}

main().catch(console.error);
