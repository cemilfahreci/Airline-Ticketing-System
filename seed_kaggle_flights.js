/**
 * Kaggle Flight Prices Dataset'e Dayali Gercekci Ucus Seed Script
 * https://www.kaggle.com/datasets/dilwong/flightprices
 */

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@flightsystem.com';
const ADMIN_PASSWORD = 'password123';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk';
const SUPABASE_AUTH_URL = 'https://zkuzdsolyrwlxyfkgwzp.supabase.co/auth/v1/token?grant_type=password';

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

const kaggleFlights = [
    // ABD Ic Hat
    { flight_number: 'AA101', origin: 'JFK', destination: 'LAX', duration: 330, base_price: 289, capacity: 180, is_direct: true },
    { flight_number: 'AA102', origin: 'LAX', destination: 'JFK', duration: 300, base_price: 279, capacity: 180, is_direct: true },
    { flight_number: 'UA201', origin: 'JFK', destination: 'SFO', duration: 360, base_price: 319, capacity: 200, is_direct: true },
    { flight_number: 'UA202', origin: 'SFO', destination: 'JFK', duration: 330, base_price: 309, capacity: 200, is_direct: true },
    { flight_number: 'DL301', origin: 'JFK', destination: 'MIA', duration: 180, base_price: 179, capacity: 160, is_direct: true },
    { flight_number: 'DL302', origin: 'MIA', destination: 'JFK', duration: 180, base_price: 169, capacity: 160, is_direct: true },
    { flight_number: 'AA401', origin: 'JFK', destination: 'ORD', duration: 150, base_price: 149, capacity: 150, is_direct: true },
    { flight_number: 'AA402', origin: 'ORD', destination: 'JFK', duration: 140, base_price: 139, capacity: 150, is_direct: true },
    { flight_number: 'UA501', origin: 'LAX', destination: 'SEA', duration: 160, base_price: 159, capacity: 180, is_direct: true },
    { flight_number: 'UA502', origin: 'SEA', destination: 'LAX', duration: 165, base_price: 149, capacity: 180, is_direct: true },
    { flight_number: 'DL601', origin: 'LAX', destination: 'DFW', duration: 195, base_price: 189, capacity: 160, is_direct: true },
    { flight_number: 'DL602', origin: 'DFW', destination: 'LAX', duration: 200, base_price: 179, capacity: 160, is_direct: true },
    { flight_number: 'SW701', origin: 'LAX', destination: 'LAS', duration: 60, base_price: 79, capacity: 140, is_direct: true },
    { flight_number: 'SW702', origin: 'LAS', destination: 'LAX', duration: 55, base_price: 69, capacity: 140, is_direct: true },
    { flight_number: 'AA801', origin: 'LAX', destination: 'PHX', duration: 75, base_price: 89, capacity: 150, is_direct: true },
    { flight_number: 'AA802', origin: 'PHX', destination: 'LAX', duration: 70, base_price: 79, capacity: 150, is_direct: true },
    { flight_number: 'UA901', origin: 'ORD', destination: 'DEN', duration: 150, base_price: 139, capacity: 180, is_direct: true },
    { flight_number: 'UA902', origin: 'DEN', destination: 'ORD', duration: 155, base_price: 129, capacity: 180, is_direct: true },
    { flight_number: 'AA1001', origin: 'ORD', destination: 'DFW', duration: 150, base_price: 149, capacity: 170, is_direct: true },
    { flight_number: 'AA1002', origin: 'DFW', destination: 'ORD', duration: 145, base_price: 139, capacity: 170, is_direct: true },
    { flight_number: 'DL1101', origin: 'ORD', destination: 'ATL', duration: 120, base_price: 119, capacity: 160, is_direct: true },
    { flight_number: 'DL1102', origin: 'ATL', destination: 'ORD', duration: 115, base_price: 109, capacity: 160, is_direct: true },
    { flight_number: 'DL1201', origin: 'ATL', destination: 'LAX', duration: 270, base_price: 249, capacity: 200, is_direct: true },
    { flight_number: 'DL1202', origin: 'LAX', destination: 'ATL', duration: 250, base_price: 239, capacity: 200, is_direct: true },
    { flight_number: 'DL1301', origin: 'ATL', destination: 'MIA', duration: 110, base_price: 99, capacity: 160, is_direct: true },
    { flight_number: 'DL1302', origin: 'MIA', destination: 'ATL', duration: 105, base_price: 89, capacity: 160, is_direct: true },
    { flight_number: 'SW1401', origin: 'ATL', destination: 'DFW', duration: 150, base_price: 129, capacity: 140, is_direct: true },
    { flight_number: 'SW1402', origin: 'DFW', destination: 'ATL', duration: 145, base_price: 119, capacity: 140, is_direct: true },
    { flight_number: 'AA1501', origin: 'DFW', destination: 'DEN', duration: 135, base_price: 119, capacity: 180, is_direct: true },
    { flight_number: 'AA1502', origin: 'DEN', destination: 'DFW', duration: 130, base_price: 109, capacity: 180, is_direct: true },
    { flight_number: 'UA1701', origin: 'SFO', destination: 'SEA', duration: 120, base_price: 129, capacity: 180, is_direct: true },
    { flight_number: 'UA1702', origin: 'SEA', destination: 'SFO', duration: 115, base_price: 119, capacity: 180, is_direct: true },
    { flight_number: 'JB1901', origin: 'BOS', destination: 'JFK', duration: 75, base_price: 79, capacity: 150, is_direct: true },
    { flight_number: 'JB1902', origin: 'JFK', destination: 'BOS', duration: 70, base_price: 69, capacity: 150, is_direct: true },
    { flight_number: 'DL2001', origin: 'BOS', destination: 'MIA', duration: 210, base_price: 189, capacity: 160, is_direct: true },
    { flight_number: 'DL2002', origin: 'MIA', destination: 'BOS', duration: 205, base_price: 179, capacity: 160, is_direct: true },
    // Turkiye & Avrupa
    { flight_number: 'TK1', origin: 'IST', destination: 'LHR', duration: 240, base_price: 299, capacity: 350, is_direct: true },
    { flight_number: 'TK2', origin: 'LHR', destination: 'IST', duration: 235, base_price: 289, capacity: 350, is_direct: true },
    { flight_number: 'TK3', origin: 'IST', destination: 'CDG', duration: 210, base_price: 269, capacity: 300, is_direct: true },
    { flight_number: 'TK4', origin: 'CDG', destination: 'IST', duration: 215, base_price: 259, capacity: 300, is_direct: true },
    { flight_number: 'TK5', origin: 'IST', destination: 'FRA', duration: 195, base_price: 249, capacity: 300, is_direct: true },
    { flight_number: 'TK6', origin: 'FRA', destination: 'IST', duration: 190, base_price: 239, capacity: 300, is_direct: true },
    { flight_number: 'TK501', origin: 'IST', destination: 'AYT', duration: 75, base_price: 69, capacity: 180, is_direct: true },
    { flight_number: 'TK502', origin: 'AYT', destination: 'IST', duration: 70, base_price: 59, capacity: 180, is_direct: true },
    { flight_number: 'TK503', origin: 'IST', destination: 'ADB', duration: 60, base_price: 59, capacity: 180, is_direct: true },
    { flight_number: 'TK504', origin: 'ADB', destination: 'IST', duration: 55, base_price: 49, capacity: 180, is_direct: true },
    { flight_number: 'TK505', origin: 'SAW', destination: 'ESB', duration: 60, base_price: 49, capacity: 180, is_direct: true },
    { flight_number: 'TK506', origin: 'ESB', destination: 'SAW', duration: 55, base_price: 45, capacity: 180, is_direct: true },
    { flight_number: 'TK177', origin: 'IST', destination: 'JFK', duration: 600, base_price: 799, capacity: 350, is_direct: true },
    { flight_number: 'TK178', origin: 'JFK', destination: 'IST', duration: 570, base_price: 779, capacity: 350, is_direct: true },
    { flight_number: 'TK179', origin: 'IST', destination: 'LAX', duration: 720, base_price: 899, capacity: 350, is_direct: true },
    { flight_number: 'TK180', origin: 'LAX', destination: 'IST', duration: 700, base_price: 879, capacity: 350, is_direct: true },
    { flight_number: 'BA115', origin: 'LHR', destination: 'JFK', duration: 420, base_price: 649, capacity: 300, is_direct: true },
    { flight_number: 'BA116', origin: 'JFK', destination: 'LHR', duration: 390, base_price: 629, capacity: 300, is_direct: true },
    { flight_number: 'LH400', origin: 'FRA', destination: 'JFK', duration: 510, base_price: 619, capacity: 300, is_direct: true },
    { flight_number: 'LH401', origin: 'JFK', destination: 'FRA', duration: 480, base_price: 599, capacity: 300, is_direct: true },
    { flight_number: 'TK790', origin: 'IST', destination: 'DXB', duration: 240, base_price: 349, capacity: 300, is_direct: true },
    { flight_number: 'TK791', origin: 'DXB', destination: 'IST', duration: 250, base_price: 339, capacity: 300, is_direct: true },
    { flight_number: 'EK001', origin: 'DXB', destination: 'LHR', duration: 420, base_price: 549, capacity: 400, is_direct: true },
    { flight_number: 'EK002', origin: 'LHR', destination: 'DXB', duration: 430, base_price: 529, capacity: 400, is_direct: true },
];

function generateFlightsWithDates() {
    const allFlights = [];
    for (let day = 1; day <= 30; day++) {
        kaggleFlights.forEach((flight, index) => {
            const hour = 6 + (index % 16);
            const departureTime = getFutureDate(day, hour, (index * 17) % 60);
            const arrivalTime = addMinutes(departureTime, flight.duration);
            let priceMultiplier = 1.0;
            const d = new Date();
            d.setDate(d.getDate() + day);
            const dayOfWeek = d.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) priceMultiplier *= 1.15;
            if (day <= 7) priceMultiplier *= 1.25;
            if (day >= 14) priceMultiplier *= 0.9;
            allFlights.push({
                flight_number: flight.flight_number + '-D' + day,
                origin_airport_code: flight.origin,
                destination_airport_code: flight.destination,
                departure_time: departureTime,
                arrival_time: arrivalTime,
                total_capacity: flight.capacity,
                base_price: Math.round(flight.base_price * priceMultiplier * 100) / 100,
                duration_minutes: flight.duration,
                is_direct: flight.is_direct
            });
        });
    }
    return allFlights;
}

async function seed() {
    console.log('Starting Kaggle-based flight seed...');
    const loginRes = await fetch(SUPABASE_AUTH_URL, {
        method: 'POST',
        headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    if (!loginRes.ok) { console.error('Login failed'); return; }
    const { access_token } = await loginRes.json();
    console.log('Logged in successfully');
    
    const allFlights = generateFlightsWithDates();
    console.log('Adding ' + allFlights.length + ' flights...');
    
    let added = 0, skipped = 0, failed = 0;
    for (let i = 0; i < allFlights.length; i++) {
        const flight = allFlights[i];
        try {
            const res = await fetch(BASE_URL + '/api/v1/admin/flights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access_token },
                body: JSON.stringify(flight)
            });
            if (res.ok) { added++; if (added % 100 === 0) console.log('Added ' + added + ' flights...'); }
            else { const err = await res.text(); if (err.includes('duplicate')) skipped++; else failed++; }
        } catch (e) { failed++; }
    }
    console.log('Done! Added: ' + added + ', Skipped: ' + skipped + ', Failed: ' + failed);
}

seed().catch(console.error);
