require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth, requireRole, optionalAuth, ROLES } = require('./middleware/auth');
const { supabase, supabaseAdmin } = require('./config/supabase');
const cache = require('./config/cache');
const { predictPrice } = require('./ml/pricePredictor');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 3001;

// RabbitMQ connection
let rabbitChannel = null;
let rabbitRetryCount = 0;
const MAX_RABBIT_RETRIES = 5;
const RABBIT_CONNECT_TIMEOUT = 5000; // 5 seconds
const BOOKING_QUEUE = 'booking_confirmation_queue';

const connectRabbitMQ = async () => {
    try {
        if (!process.env.RABBITMQ_URL) {
            console.log('⚠️  RABBITMQ_URL not configured - booking emails disabled');
            return;
        }

        if (rabbitRetryCount >= MAX_RABBIT_RETRIES) {
            console.log(`⚠️  RabbitMQ max retries (${MAX_RABBIT_RETRIES}) reached. Booking emails disabled.`);
            return;
        }

        rabbitRetryCount++;
        console.log(`🔄 RabbitMQ connection attempt ${rabbitRetryCount}/${MAX_RABBIT_RETRIES}...`);

        // Add connection timeout
        const connectPromise = amqp.connect(process.env.RABBITMQ_URL);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), RABBIT_CONNECT_TIMEOUT)
        );

        const connection = await Promise.race([connectPromise, timeoutPromise]);
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue(BOOKING_QUEUE, { durable: true });
        console.log('✅ Connected to RabbitMQ for booking notifications');
        rabbitRetryCount = 0; // Reset on success

        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err.message);
            rabbitChannel = null;
            if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
                setTimeout(connectRabbitMQ, 5000);
            }
        });

        connection.on('close', () => {
            rabbitChannel = null;
            if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
                setTimeout(connectRabbitMQ, 5000);
            }
        });

    } catch (error) {
        console.log('⚠️  RabbitMQ connection failed:', error.message);
        rabbitChannel = null;

        if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
            const retryDelay = Math.min(10000, 2000 * rabbitRetryCount);
            console.log(`   Retrying in ${retryDelay / 1000} seconds... (${rabbitRetryCount}/${MAX_RABBIT_RETRIES})`);
            setTimeout(connectRabbitMQ, retryDelay);
        }
    }
};

const queueBookingEmail = (booking) => {
    if (!rabbitChannel) return false;
    try {
        rabbitChannel.sendToQueue(BOOKING_QUEUE, Buffer.from(JSON.stringify(booking)), { persistent: true });
        console.log('📤 Booking confirmation queued for:', booking.contact_email);
        return true;
    } catch (err) {
        console.error('Failed to queue booking email:', err);
        return false;
    }
};

// Initialize RabbitMQ (non-blocking)
setImmediate(connectRabbitMQ);

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// HEALTH ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'flight-service', timestamp: new Date().toISOString() });
});

app.get('/api/v1/admin/health', (req, res) => {
    res.json({ status: 'ok', endpoint: 'admin', timestamp: new Date().toISOString() });
});

app.get('/api/v1/flights/health', (req, res) => {
    res.json({ status: 'ok', endpoint: 'flights', timestamp: new Date().toISOString() });
});

app.get('/api/v1/tickets/health', (req, res) => {
    res.json({ status: 'ok', endpoint: 'tickets', timestamp: new Date().toISOString() });
});

// ============================================
// ADMIN ENDPOINTS (Protected - ADMIN role required)
// ============================================

// POST /api/v1/admin/flights - Add new flight (ADMIN only)
app.post('/api/v1/admin/flights', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const {
            flight_number,
            origin_airport_code,
            destination_airport_code,
            departure_time,
            arrival_time,
            total_capacity,
            base_price,
            is_direct = true
        } = req.body;

        // Validate required fields
        if (!flight_number || !origin_airport_code || !destination_airport_code ||
            !departure_time || !arrival_time || !total_capacity || !base_price) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate flight number format (e.g., TK123, AA456)
        if (!/^[A-Z]{2}\d{1,4}$/i.test(flight_number)) {
            return res.status(400).json({ error: 'Invalid flight number format. Expected format: XX123 (e.g., TK123)' });
        }

        // Validate airport codes are different
        if (origin_airport_code.toUpperCase() === destination_airport_code.toUpperCase()) {
            return res.status(400).json({ error: 'Origin and destination airports must be different' });
        }

        // Validate capacity
        const capacity = parseInt(total_capacity);
        if (isNaN(capacity) || capacity <= 0 || capacity > 1000) {
            return res.status(400).json({ error: 'Total capacity must be between 1 and 1000' });
        }

        // Validate price
        const price = parseFloat(base_price);
        if (isNaN(price) || price <= 0) {
            return res.status(400).json({ error: 'Base price must be a positive number' });
        }

        // Get airport IDs
        const { data: originAirport, error: originError } = await supabaseAdmin
            .from('airports')
            .select('id')
            .eq('code', origin_airport_code)
            .single();

        const { data: destAirport, error: destError } = await supabaseAdmin
            .from('airports')
            .select('id')
            .eq('code', destination_airport_code)
            .single();

        if (originError || !originAirport) {
            return res.status(400).json({ error: `Origin airport not found: ${origin_airport_code}` });
        }

        if (destError || !destAirport) {
            return res.status(400).json({ error: `Destination airport not found: ${destination_airport_code}` });
        }

        // Calculate duration in minutes
        const depTime = new Date(departure_time);
        const arrTime = new Date(arrival_time);
        const duration_minutes = Math.round((arrTime - depTime) / (1000 * 60));

        if (duration_minutes <= 0) {
            return res.status(400).json({ error: 'Arrival time must be after departure time' });
        }

        // TODO: ML price prediction will be added in Phase 4
        const predicted_price = base_price; // Placeholder

        // Insert flight
        const { data: flight, error: insertError } = await supabaseAdmin
            .from('flights')
            .insert({
                flight_number,
                origin_airport_id: originAirport.id,
                destination_airport_id: destAirport.id,
                departure_time,
                arrival_time,
                duration_minutes,
                total_capacity,
                available_capacity: total_capacity,
                base_price,
                predicted_price,
                is_direct,
                status: 'SCHEDULED'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            return res.status(500).json({ error: 'Failed to create flight', details: insertError.message });
        }

        // Invalidate search cache when new flight is added
        await cache.delByPattern('cache:search:*');
        console.log('🗑️  Search cache invalidated after new flight added');

        res.status(201).json({
            message: 'Flight created successfully',
            flight: {
                ...flight,
                origin_airport_code,
                destination_airport_code
            }
        });

    } catch (error) {
        console.error('Error creating flight:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/admin/flights - List all flights (ADMIN only)
app.get('/api/v1/admin/flights', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const { page = 1, limit = 1000 } = req.query; // Increased limit to 1000 to show all flights
        const offset = (page - 1) * limit;

        const { data: flights, error, count } = await supabaseAdmin
            .from('flights')
            .select(`
        *,
        origin:airports!flights_origin_airport_id_fkey(code, name, city),
        destination:airports!flights_destination_airport_id_fkey(code, name, city)
      `, { count: 'exact' })
            .order('departure_time', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('❌ Error fetching flights:', error);
            return res.status(500).json({ error: 'Failed to fetch flights', details: error.message });
        }

        console.log(`📊 Admin flights query: Found ${count || 0} total flights, returning ${flights?.length || 0} flights (page ${page}, limit ${limit})`);

        // Disable caching for admin flights list to ensure fresh data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.json({
            flights,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching flights:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/admin/predict-price - ML price prediction (ADMIN only)
app.post('/api/v1/admin/predict-price', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const {
            origin_airport_code,
            destination_airport_code,
            departure_time,
            duration_minutes,
            is_direct = true,
            base_price = null
        } = req.body;

        console.log('Predict price request:', {
            origin_airport_code,
            destination_airport_code,
            departure_time,
            duration_minutes,
            is_direct,
            base_price
        });

        if (!origin_airport_code || !destination_airport_code || !departure_time || !duration_minutes) {
            return res.status(400).json({
                error: 'Missing required fields: origin_airport_code, destination_airport_code, departure_time, duration_minutes'
            });
        }

        const duration = parseInt(duration_minutes);
        if (isNaN(duration) || duration <= 0) {
            return res.status(400).json({
                error: 'Invalid duration_minutes. Must be a positive number.'
            });
        }

        let prediction;
        try {
            prediction = predictPrice({
                durationMinutes: duration,
                departureTime: departure_time,
                isDirect: is_direct,
                originCode: origin_airport_code.toUpperCase(),
                destinationCode: destination_airport_code.toUpperCase(),
                basePrice: base_price ? parseFloat(base_price) : null
            });
        } catch (predictionError) {
            console.error('Prediction calculation error:', predictionError);
            return res.status(400).json({
                error: 'Prediction calculation failed',
                details: predictionError.message
            });
        }

        console.log('✅ Prediction result:', prediction);

        if (!prediction || !prediction.predictedPrice) {
            console.error('Invalid prediction result:', prediction);
            return res.status(500).json({
                error: 'Invalid prediction result',
                details: 'Prediction function returned invalid data'
            });
        }

        res.json({
            message: 'Price prediction successful',
            prediction
        });

    } catch (error) {
        console.error('Error predicting price:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ============================================
// PUBLIC FLIGHT ENDPOINTS
// ============================================

// GET /api/v1/flights/airports - Get all airports (for search dropdowns) - CACHED
app.get('/api/v1/flights/airports', async (req, res) => {
    try {
        // Check Redis cache first
        const cacheKey = cache.CACHE_KEYS.AIRPORTS;
        const cachedAirports = await cache.get(cacheKey);

        if (cachedAirports) {
            console.log('📦 Redis Cache HIT: airports');
            return res.json({ airports: cachedAirports, cached: true, cacheType: 'redis' });
        }

        console.log('📭 Redis Cache MISS: airports');

        const { data: airports, error } = await supabase
            .from('airports')
            .select('id, code, name, city, country')
            .order('city', { ascending: true });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch airports' });
        }

        // Cache for 10 minutes (airports rarely change)
        await cache.set(cacheKey, airports, 600);

        res.json({ airports, cached: false });

    } catch (error) {
        console.error('Error fetching airports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/flights/cache-stats - Get cache statistics
app.get('/api/v1/flights/cache-stats', async (req, res) => {
    const stats = await cache.getStats();
    res.json({
        stats,
        redisConnected: cache.isReady(),
        message: 'Redis cache statistics'
    });
});

// GET /api/v1/flights/search - Search flights (public) - CACHED
app.get('/api/v1/flights/search', optionalAuth, async (req, res) => {
    try {
        const {
            from,
            to,
            date,
            start_date,
            end_date,
            passengers = 1,
            flexible = false,
            direct_only = false,
            page = 1,
            limit = 100 // Increased limit for date range searches
        } = req.query;

        console.log('🔍 Flight search request:', {
            from, to, date, start_date, end_date, passengers, flexible, direct_only, page, limit
        });

        if (!from || !to) {
            console.error('❌ Missing required parameters: from or to');
            return res.status(400).json({
                error: 'Missing required parameters: from, to'
            });
        }

        const passengerCount = parseInt(passengers);
        const offset = (page - 1) * limit;

        // Build date range - support both single date and date range
        let startDate, endDate;

        try {
            if (start_date && end_date) {
                // Date range search (new feature)
                // Handle both YYYY-MM-DD and DD.MM.YYYY formats
                let startDateStr = start_date;
                let endDateStr = end_date;

                // Convert DD.MM.YYYY to YYYY-MM-DD if needed
                if (start_date.includes('.')) {
                    const [day, month, year] = start_date.split('.');
                    startDateStr = `${year}-${month}-${day}`;
                }
                if (end_date.includes('.')) {
                    const [day, month, year] = end_date.split('.');
                    endDateStr = `${year}-${month}-${day}`;
                }

                startDate = new Date(startDateStr);
                if (isNaN(startDate.getTime())) {
                    return res.status(400).json({
                        error: `Invalid start_date format: ${start_date}. Expected YYYY-MM-DD or DD.MM.YYYY`
                    });
                }
                startDate.setHours(0, 0, 0, 0);

                endDate = new Date(endDateStr);
                if (isNaN(endDate.getTime())) {
                    return res.status(400).json({
                        error: `Invalid end_date format: ${end_date}. Expected YYYY-MM-DD or DD.MM.YYYY`
                    });
                }
                endDate.setHours(23, 59, 59, 999);

                if (startDate > endDate) {
                    return res.status(400).json({
                        error: 'Start date must be before or equal to end date'
                    });
                }

                // Limit date range to 30 days
                const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                if (daysDiff > 30) {
                    return res.status(400).json({
                        error: 'Date range cannot exceed 30 days'
                    });
                }

                console.log(`📅 Date range search: ${startDate.toISOString()} to ${endDate.toISOString()} (${daysDiff} days)`);
            } else if (date) {
                // Single date search (existing behavior)
                let dateStr = date;

                // Convert DD.MM.YYYY to YYYY-MM-DD if needed
                if (date.includes('.')) {
                    const [day, month, year] = date.split('.');
                    dateStr = `${year}-${month}-${day}`;
                }

                const searchDate = new Date(dateStr);
                if (isNaN(searchDate.getTime())) {
                    return res.status(400).json({
                        error: `Invalid date format: ${date}. Expected YYYY-MM-DD or DD.MM.YYYY`
                    });
                }

                if (flexible === 'true') {
                    startDate = new Date(searchDate);
                    startDate.setDate(startDate.getDate() - 3);
                    endDate = new Date(searchDate);
                    endDate.setDate(endDate.getDate() + 3);
                } else {
                    startDate = new Date(searchDate);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(searchDate);
                    endDate.setHours(23, 59, 59, 999);
                }
            } else {
                return res.status(400).json({
                    error: 'Missing required parameter: date or (start_date and end_date)'
                });
            }
        } catch (dateError) {
            console.error('❌ Date parsing error:', dateError);
            return res.status(400).json({
                error: 'Invalid date format',
                details: dateError.message
            });
        }

        // Check Redis cache first
        const cacheKey = cache.CACHE_KEYS.FLIGHT_SEARCH({
            from: from.toUpperCase(),
            to: to.toUpperCase(),
            date: start_date && end_date ? `${start_date}_${end_date}` : date,
            passengers: passengerCount,
            flexible,
            direct_only,
            page,
            limit
        });

        const cachedResult = await cache.get(cacheKey);
        if (cachedResult) {
            console.log(`📦 Redis Cache HIT: flight search ${from}->${to}`);
            return res.json({ ...cachedResult, cached: true, cacheType: 'redis' });
        }

        console.log(`📭 Redis Cache MISS: flight search ${from}->${to}`);

        // Get airport IDs with better error handling
        const { data: originAirport, error: originError } = await supabase
            .from('airports')
            .select('id, code, city')
            .eq('code', from.toUpperCase())
            .maybeSingle(); // Use maybeSingle() instead of single() to avoid error if not found

        const { data: destAirport, error: destError } = await supabase
            .from('airports')
            .select('id, code, city')
            .eq('code', to.toUpperCase())
            .maybeSingle();

        if (originError || destError) {
            console.error('❌ Error fetching airports:', { originError, destError });
            return res.status(500).json({
                error: 'Failed to fetch airport information',
                details: originError?.message || destError?.message
            });
        }

        if (!originAirport) {
            console.error(`❌ Origin airport not found: ${from.toUpperCase()}`);
            return res.status(400).json({
                error: `Origin airport not found: ${from.toUpperCase()}`,
                suggestion: 'Please check the airport code and try again'
            });
        }

        if (!destAirport) {
            console.error(`❌ Destination airport not found: ${to.toUpperCase()}`);
            return res.status(400).json({
                error: `Destination airport not found: ${to.toUpperCase()}`,
                suggestion: 'Please check the airport code and try again'
            });
        }

        console.log(`✅ Airports found: ${originAirport.code} (${originAirport.city}) → ${destAirport.code} (${destAirport.city})`);

        // Build query
        let query = supabase
            .from('flights')
            .select(`
        *,
        origin:airports!flights_origin_airport_id_fkey(code, name, city),
        destination:airports!flights_destination_airport_id_fkey(code, name, city)
      `, { count: 'exact' })
            .eq('origin_airport_id', originAirport.id)
            .eq('destination_airport_id', destAirport.id)
            .gte('departure_time', startDate.toISOString())
            .lte('departure_time', endDate.toISOString())
            .gte('available_capacity', passengerCount)
            .eq('status', 'SCHEDULED');

        if (direct_only === 'true') {
            query = query.eq('is_direct', true);
        }

        // For date range searches, don't paginate - return all flights
        // For single date searches, use pagination
        const shouldPaginate = !start_date || !end_date;
        const finalQuery = shouldPaginate
            ? query.order('departure_time', { ascending: true }).range(offset, offset + parseInt(limit) - 1)
            : query.order('departure_time', { ascending: true });

        const { data: directFlights, error: directError, count: directCount } = await finalQuery;

        if (directError) {
            return res.status(500).json({ error: 'Failed to search flights', details: directError.message });
        }

        let allFlights = [...(directFlights || [])];
        let totalCount = directCount || 0;

        // If direct_only is false, also search for connecting flights AUTOMATICALLY
        // System will find best connecting routes through major hubs
        // OPTIMIZED: Parallel processing for speed
        if (direct_only !== 'true') {
            console.log(`🔍 Searching for automatic connecting flights: ${from} → ${to}`);

            // Major hub airports only - reduced for speed
            const MAJOR_HUBS = ['IST', 'SAW', 'DXB', 'LHR', 'FRA', 'CDG'];

            // Get only major hub airports for connections (faster)
            const { data: hubAirports, error: airportsError } = await supabase
                .from('airports')
                .select('id, code')
                .in('code', MAJOR_HUBS)
                .neq('id', originAirport.id)
                .neq('id', destAirport.id);

            if (airportsError) {
                console.error('❌ Error fetching hub airports:', airportsError);
            }

            const connectionPoints = hubAirports || [];
            console.log(`📍 Checking ${connectionPoints.length} major hubs: ${connectionPoints.map(cp => cp.code).join(', ')}`);

            const connectingFlights = [];
            const MAX_CONNECTING_FLIGHTS = 20; // Stop early when we have enough

            // PARALLEL: Fetch all first legs at once
            const firstLegPromises = connectionPoints.map(cp =>
                supabase
                    .from('flights')
                    .select(`*, origin:airports!flights_origin_airport_id_fkey(code, name, city), destination:airports!flights_destination_airport_id_fkey(code, name, city)`)
                    .eq('origin_airport_id', originAirport.id)
                    .eq('destination_airport_id', cp.id)
                    .gte('departure_time', startDate.toISOString())
                    .lte('departure_time', endDate.toISOString())
                    .gte('available_capacity', passengerCount)
                    .eq('status', 'SCHEDULED')
                    .order('departure_time', { ascending: true })
                    .limit(5) // Reduced for speed
            );

            const firstLegResults = await Promise.all(firstLegPromises);

            // Collect all first legs with their connection points
            const allFirstLegs = [];
            firstLegResults.forEach((result, idx) => {
                if (!result.error && result.data) {
                    result.data.forEach(flight => {
                        allFirstLegs.push({ flight, connectionPoint: connectionPoints[idx] });
                    });
                }
            });

            console.log(`  ✓ Found ${allFirstLegs.length} total first legs across all hubs`);

            // PARALLEL: Fetch all second legs at once
            if (allFirstLegs.length > 0) {
                const secondLegPromises = allFirstLegs.slice(0, 30).map(({ flight: firstLeg, connectionPoint }) => {
                    const firstLegArrival = new Date(firstLeg.arrival_time);
                    const minConnectionTime = new Date(firstLegArrival.getTime() + 60 * 60 * 1000); // +1 hour
                    const maxConnectionTime = new Date(Math.min(
                        firstLegArrival.getTime() + (12 * 60 * 60 * 1000), // 12 hours max for speed
                        endDate.getTime()
                    ));

                    return supabase
                        .from('flights')
                        .select(`*, origin:airports!flights_origin_airport_id_fkey(code, name, city), destination:airports!flights_destination_airport_id_fkey(code, name, city)`)
                        .eq('origin_airport_id', connectionPoint.id)
                        .eq('destination_airport_id', destAirport.id)
                        .gte('departure_time', minConnectionTime.toISOString())
                        .lte('departure_time', maxConnectionTime.toISOString())
                        .gte('available_capacity', passengerCount)
                        .eq('status', 'SCHEDULED')
                        .order('departure_time', { ascending: true })
                        .limit(3) // Reduced for speed
                        .then(result => ({ result, firstLeg, connectionPoint }));
                });

                const secondLegResults = await Promise.all(secondLegPromises);

                // Process results
                for (const { result, firstLeg, connectionPoint } of secondLegResults) {
                    if (connectingFlights.length >= MAX_CONNECTING_FLIGHTS) break;

                    if (result.error || !result.data || result.data.length === 0) continue;

                    for (const secondLeg of result.data) {
                        if (connectingFlights.length >= MAX_CONNECTING_FLIGHTS) break;

                        const layoverMinutes = Math.round((new Date(secondLeg.departure_time) - new Date(firstLeg.arrival_time)) / (1000 * 60));
                        if (layoverMinutes < 60 || layoverMinutes > 720) continue; // 1-12 hours

                        const totalPrice = parseFloat(firstLeg.predicted_price || firstLeg.base_price || 0) +
                            parseFloat(secondLeg.predicted_price || secondLeg.base_price || 0);
                        const totalDuration = Math.round((new Date(secondLeg.arrival_time) - new Date(firstLeg.departure_time)) / (1000 * 60));

                        connectingFlights.push({
                            id: `conn_${firstLeg.id}_${secondLeg.id}`,
                            flight_number: `${firstLeg.flight_number} + ${secondLeg.flight_number}`,
                            origin: firstLeg.origin,
                            destination: secondLeg.destination,
                            departure_time: firstLeg.departure_time,
                            arrival_time: secondLeg.arrival_time,
                            duration_minutes: totalDuration,
                            total_capacity: Math.min(firstLeg.total_capacity, secondLeg.total_capacity),
                            available_capacity: Math.min(firstLeg.available_capacity, secondLeg.available_capacity),
                            base_price: (parseFloat(firstLeg.base_price || 0) + parseFloat(secondLeg.base_price || 0)).toFixed(2),
                            predicted_price: totalPrice.toFixed(2),
                            is_direct: false,
                            status: 'SCHEDULED',
                            segments: [
                                { flight_id: firstLeg.id, flight_number: firstLeg.flight_number, origin: firstLeg.origin, destination: firstLeg.destination, departure_time: firstLeg.departure_time, arrival_time: firstLeg.arrival_time, duration_minutes: firstLeg.duration_minutes },
                                { flight_id: secondLeg.id, flight_number: secondLeg.flight_number, origin: secondLeg.origin, destination: secondLeg.destination, departure_time: secondLeg.departure_time, arrival_time: secondLeg.arrival_time, duration_minutes: secondLeg.duration_minutes, layover_minutes: layoverMinutes }
                            ],
                            connection_airport: firstLeg.destination,
                            connection_airport_code: connectionPoint.code,
                            is_hub_connection: true,
                            connection_score: totalPrice + (totalDuration * 0.1) + (layoverMinutes * 0.05)
                        });
                    }
                }
            }

            // Sort connecting flights by score (best connections first)
            connectingFlights.sort((a, b) => a.connection_score - b.connection_score);

            // Limit to best 20 connecting flights
            const bestConnectingFlights = connectingFlights.slice(0, 20);

            console.log(`✅ Found ${bestConnectingFlights.length} connecting flights via ${connectionPoints.length} hubs (parallel search)`);

            if (bestConnectingFlights.length > 0) {
                console.log(`   Sample: ${bestConnectingFlights.slice(0, 3).map(cf => `${cf.origin?.code}→${cf.connection_airport_code}→${cf.destination?.code}`).join(', ')}`);
            }

            allFlights.push(...bestConnectingFlights);
            totalCount += bestConnectingFlights.length;

            // Sort all flights: direct first, then by departure time
            allFlights.sort((a, b) => {
                if (a.is_direct && !b.is_direct) return -1;
                if (!a.is_direct && b.is_direct) return 1;
                return new Date(a.departure_time) - new Date(b.departure_time);
            });

            // Apply pagination to combined results
            const paginatedFlights = allFlights.slice(offset, offset + parseInt(limit));
            allFlights = paginatedFlights;
        }

        const result = {
            flights: allFlights,
            search_params: {
                from,
                to,
                date,
                passengers: passengerCount,
                flexible: flexible === 'true',
                direct_only: direct_only === 'true'
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        };

        // Cache for 2 minutes (flight availability changes frequently)
        await cache.set(cacheKey, result, 120);

        res.json({ ...result, cached: false });

    } catch (error) {
        console.error('Error searching flights:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/flights/:id - Get flight details - CACHED
app.get('/api/v1/flights/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check Redis cache first
        const cacheKey = cache.CACHE_KEYS.FLIGHT_DETAIL(id);
        const cachedFlight = await cache.get(cacheKey);

        if (cachedFlight) {
            console.log(`📦 Redis Cache HIT: flight ${id}`);
            return res.json({ flight: cachedFlight, cached: true, cacheType: 'redis' });
        }

        console.log(`📭 Redis Cache MISS: flight ${id}`);

        const { data: flight, error } = await supabase
            .from('flights')
            .select(`
        *,
        origin:airports!flights_origin_airport_id_fkey(code, name, city, country),
        destination:airports!flights_destination_airport_id_fkey(code, name, city, country)
      `)
            .eq('id', id)
            .single();

        if (error || !flight) {
            return res.status(404).json({ error: 'Flight not found' });
        }

        // Cache for 3 minutes
        await cache.set(cacheKey, flight, 180);

        res.json({ flight, cached: false });

    } catch (error) {
        console.error('Error fetching flight:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// BOOKINGS ENDPOINTS
// ============================================

// GET /api/v1/bookings/member/:memberId - Get bookings by miles member ID
app.get('/api/v1/bookings/member/:memberId', async (req, res) => {
    try {
        const { memberId } = req.params;

        const { data: bookings, error } = await supabaseAdmin
            .from('bookings')
            .select(`
                *,
                flight:flights!bookings_flight_id_fkey(
                    id, flight_number, departure_time, arrival_time, duration_minutes,
                    origin:airports!flights_origin_airport_id_fkey(code, city),
                    destination:airports!flights_destination_airport_id_fkey(code, city)
                )
            `)
            .eq('miles_member_id', memberId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching bookings:', error);
            return res.status(500).json({ error: 'Failed to fetch bookings' });
        }

        // Fetch passengers manually to avoid FK ambiguity issues
        const bookingIds = (bookings || []).map(b => b.id);
        const passengersMap = {};

        if (bookingIds.length > 0) {
            console.log(`🔍 Fetching passengers for ${bookingIds.length} bookings...`);
            const { data: allPassengers, error: passError } = await supabaseAdmin
                .from('passengers')
                .select('*')
                .in('booking_id', bookingIds);

            if (passError) {
                console.error('❌ Error fetching passengers:', passError);
            } else {
                console.log(`✅ Found ${allPassengers?.length || 0} passengers in DB.`);
                if (allPassengers && allPassengers.length > 0) {
                    allPassengers.forEach(p => {
                        // console.log(`   - Passenger: ${p.first_name} ${p.last_name} (Booking: ${p.booking_id})`);
                        if (p.booking_id) {
                            if (!passengersMap[p.booking_id]) passengersMap[p.booking_id] = [];
                            passengersMap[p.booking_id].push(p);
                        }
                    });
                }
            }
        }

        // Calculate total duration for connecting flights
        const enrichedBookings = await Promise.all((bookings || []).map(async (booking) => {
            let totalDuration = booking.flight?.duration_minutes || 0;
            let allSegments = [];
            let firstOrigin = booking.flight?.origin;
            let lastDestination = booking.flight?.destination;

            // If booking has flight_segments (connecting flight), fetch all segments
            if (booking.flight_segments && Array.isArray(booking.flight_segments) && booking.flight_segments.length > 1) {
                try {
                    const { data: segments } = await supabaseAdmin
                        .from('flights')
                        .select(`
                            id, flight_number, departure_time, arrival_time, duration_minutes,
                            origin:airports!flights_origin_airport_id_fkey(code, city),
                            destination:airports!flights_destination_airport_id_fkey(code, city)
                        `)
                        .in('id', booking.flight_segments);

                    if (segments && segments.length > 0) {
                        allSegments = segments.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
                        totalDuration = segments.reduce((sum, seg) => sum + (seg.duration_minutes || 0), 0);
                        firstOrigin = allSegments[0]?.origin;
                        lastDestination = allSegments[allSegments.length - 1]?.destination;
                    }
                } catch (segErr) {
                    console.error('Error fetching segments:', segErr);
                }
            }

            return {
                ...booking,
                total_duration_minutes: totalDuration,
                is_connecting: booking.flight_segments && booking.flight_segments.length > 1,
                segments: allSegments.length > 0 ? allSegments : null,
                route_origin: firstOrigin,
                route_destination: lastDestination,
                passengers: passengersMap[booking.id] || []
            };
        }));

        // Fetch credited miles from miles_ledger for each booking
        // use existing bookingIds from above
        let creditedMilesMap = {};

        if (bookingIds.length > 0) {
            try {
                const { data: ledgerEntries } = await supabaseAdmin
                    .from('miles_ledger')
                    .select('booking_id, points')
                    .in('booking_id', bookingIds)
                    .eq('transaction_type', 'EARNED');

                if (ledgerEntries) {
                    ledgerEntries.forEach(entry => {
                        creditedMilesMap[entry.booking_id] = (creditedMilesMap[entry.booking_id] || 0) + entry.points;
                    });
                }
            } catch (ledgerErr) {
                console.error('Error fetching miles ledger:', ledgerErr);
            }
        }

        // Add credited_miles to each booking
        const bookingsWithMiles = enrichedBookings.map(booking => ({
            ...booking,
            credited_miles: creditedMilesMap[booking.id] || 0
        }));

        res.json({ bookings: bookingsWithMiles });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/bookings/:reference - Get booking by reference
app.get('/api/v1/bookings/:reference', async (req, res) => {
    try {
        const { reference } = req.params;

        const { data: booking, error } = await supabaseAdmin
            .from('bookings')
            .select(`
                *,
                flight:flights!bookings_flight_id_fkey(
                    id, flight_number, departure_time, arrival_time, duration_minutes,
                    origin:airports!flights_origin_airport_id_fkey(code, city),
                    destination:airports!flights_destination_airport_id_fkey(code, city)
                ),
                passengers(*)
            `)
            .eq('booking_reference', reference)
            .maybeSingle();

        if (error) {
            console.error('Error fetching booking:', error);
            return res.status(500).json({ error: 'Failed to fetch booking' });
        }

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ booking });
    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// TICKET ENDPOINTS (Some protected)
// ============================================

// POST /api/v1/tickets/buy - Purchase ticket
app.post('/api/v1/tickets/buy', optionalAuth, async (req, res) => {
    try {
        console.log('📥 Booking request received:', {
            hasFlightId: !!req.body.flight_id,
            hasFlightSegments: !!req.body.flight_segments,
            segmentCount: req.body.flight_segments?.length || 0,
            passengerCount: req.body.passengers?.length || 0,
            hasEmail: !!req.body.contact_email
        });

        const {
            flight_id, // Can be a single flight_id or a connecting flight composite ID (conn_xxx_yyy)
            flight_segments, // Array of flight IDs for connecting flights
            passengers, // Array of passenger objects
            contact_email,
            contact_phone,
            use_miles = false,
            miles_member_id = null
        } = req.body;

        // Validate required fields
        if (!passengers || passengers.length === 0) {
            return res.status(400).json({ error: 'Missing required field: passengers' });
        }

        if (!contact_email) {
            return res.status(400).json({ error: 'Missing required field: contact_email' });
        }

        if (!flight_id && (!flight_segments || flight_segments.length === 0)) {
            return res.status(400).json({
                error: 'Missing required field: flight_id or flight_segments',
                hint: 'Please select a flight to book'
            });
        }

        const passengerCount = passengers.length;
        let flightsToBook = [];
        let totalPrice = 0;

        // Handle connecting flights
        if (flight_segments && Array.isArray(flight_segments) && flight_segments.length > 0) {
            // Connecting flight booking
            for (const segmentFlightId of flight_segments) {
                const { data: flight, error: flightError } = await supabaseAdmin
                    .from('flights')
                    .select(`
                        *,
                        origin:airports!flights_origin_airport_id_fkey(id, code, name, city),
                        destination:airports!flights_destination_airport_id_fkey(id, code, name, city)
                    `)
                    .eq('id', segmentFlightId)
                    .single();

                if (flightError || !flight) {
                    return res.status(404).json({ error: `Flight segment not found: ${segmentFlightId}` });
                }

                if (flight.status !== 'SCHEDULED') {
                    return res.status(400).json({ error: `Flight segment is not available: ${segmentFlightId}` });
                }

                if (flight.available_capacity < passengerCount) {
                    return res.status(400).json({
                        error: `Not enough seats in flight segment ${segmentFlightId}`,
                        available: flight.available_capacity,
                        requested: passengerCount
                    });
                }

                flightsToBook.push(flight);
                totalPrice += parseFloat(flight.predicted_price || flight.base_price);
            }
        } else {
            // Single flight booking
            // Check if flight_id is a connecting flight composite ID (conn_xxx_yyy)
            if (flight_id && flight_id.startsWith('conn_')) {
                // This is a connecting flight - extract segment IDs
                const segmentIds = flight_id.replace('conn_', '').split('_');
                if (segmentIds.length >= 2) {
                    // Use flight_segments instead
                    for (const segmentId of segmentIds) {
                        const { data: flight, error: flightError } = await supabaseAdmin
                            .from('flights')
                            .select(`
                                *,
                                origin:airports!flights_origin_airport_id_fkey(id, code, name, city),
                                destination:airports!flights_destination_airport_id_fkey(id, code, name, city)
                            `)
                            .eq('id', segmentId)
                            .single();

                        if (flightError || !flight) {
                            console.error(`❌ Flight segment not found: ${segmentId}`, flightError);
                            return res.status(404).json({ error: `Flight segment not found: ${segmentId}` });
                        }

                        if (flight.status !== 'SCHEDULED') {
                            return res.status(400).json({ error: `Flight segment is not available: ${segmentId}` });
                        }

                        if (flight.available_capacity < passengerCount) {
                            return res.status(400).json({
                                error: `Not enough seats in flight segment ${segmentId}`,
                                available: flight.available_capacity,
                                requested: passengerCount
                            });
                        }

                        flightsToBook.push(flight);
                        totalPrice += parseFloat(flight.predicted_price || flight.base_price);
                    }
                } else {
                    return res.status(400).json({ error: 'Invalid connecting flight ID format' });
                }
            } else {
                // Regular single flight booking
                const { data: flight, error: flightError } = await supabaseAdmin
                    .from('flights')
                    .select(`
                        *,
                        origin:airports!flights_origin_airport_id_fkey(id, code, name, city),
                        destination:airports!flights_destination_airport_id_fkey(id, code, name, city)
                    `)
                    .eq('id', flight_id)
                    .maybeSingle(); // Use maybeSingle to avoid error if not found

                if (flightError) {
                    console.error('❌ Error fetching flight:', flightError);
                    return res.status(500).json({
                        error: 'Failed to fetch flight information',
                        details: flightError.message
                    });
                }

                if (!flight) {
                    console.error(`❌ Flight not found: ${flight_id}`);
                    return res.status(404).json({ error: `Flight not found: ${flight_id}` });
                }

                if (flight.status !== 'SCHEDULED') {
                    return res.status(400).json({ error: 'Flight is not available for booking' });
                }

                if (flight.available_capacity < passengerCount) {
                    return res.status(400).json({
                        error: 'Not enough seats available',
                        available: flight.available_capacity,
                        requested: passengerCount
                    });
                }

                flightsToBook = [flight];
                totalPrice = parseFloat(flight.predicted_price || flight.base_price || 0);
            }
        }

        const mainFlight = flightsToBook[0];

        // Calculate total price for all segments
        let total_price = totalPrice * passengerCount;
        let points_used = 0;
        let payment_method = 'CASH';

        // Handle miles payment if requested
        if (use_miles && miles_member_id) {
            const { data: member, error: memberError } = await supabaseAdmin
                .from('miles_members')
                .select('*')
                .eq('id', miles_member_id)
                .single();

            if (memberError || !member) {
                return res.status(400).json({ error: 'Miles member not found' });
            }

            // 1 point = 0.01 currency (100 points = 1 currency)
            const points_needed = Math.ceil(total_price * 100);

            if (member.total_points >= points_needed) {
                points_used = points_needed;
                payment_method = 'MILES';
                total_price = 0;
            } else {
                return res.status(400).json({
                    error: 'Not enough miles points',
                    available_points: member.total_points,
                    required_points: points_needed
                });
            }
        }

        // Generate booking reference
        const booking_reference = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create booking (use first flight_id as primary, store segments in flight_segments JSONB)
        console.log(`📝 Creating booking: ${passengerCount} passenger(s), ${flightsToBook.length} flight segment(s), total: $${total_price}`);

        // Prepare booking data - ONLY include fields that exist in schema
        // Don't include flight_segments if column doesn't exist (for backward compatibility)
        const bookingData = {
            booking_reference,
            flight_id: mainFlight.id, // Primary flight_id (first segment for connecting flights)
            user_id: req.user?.id || null,
            miles_member_id: miles_member_id || null,
            passenger_count: passengerCount,
            total_price: parseFloat(total_price.toFixed(2)), // Ensure it's a number
            points_used: parseInt(points_used) || 0,
            payment_method,
            status: 'CONFIRMED',
            contact_email: contact_email.trim(), // Trim whitespace
            contact_phone: contact_phone ? contact_phone.trim() : null
        };

        console.log('📝 Booking data prepared:', {
            booking_reference,
            flight_id: bookingData.flight_id,
            passenger_count: bookingData.passenger_count,
            total_price: bookingData.total_price,
            contact_email: bookingData.contact_email
        });

        let booking;
        const { data: bookingDataResult, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .insert(bookingData)
            .select()
            .single();

        if (bookingError) {
            console.error('❌ Booking insert error:', bookingError);
            console.error('❌ Error code:', bookingError.code);
            console.error('❌ Error message:', bookingError.message);
            console.error('❌ Error details:', bookingError.details);
            console.error('❌ Error hint:', bookingError.hint);

            // Return detailed error for debugging
            return res.status(500).json({
                error: 'Failed to create booking',
                details: bookingError.message || 'Unknown database error',
                code: bookingError.code,
                hint: bookingError.hint || `Database error code: ${bookingError.code || 'unknown'}. Check if all required columns exist.`,
                debug: {
                    attemptedFields: Object.keys(bookingData),
                    flightId: bookingData.flight_id,
                    passengerCount: bookingData.passenger_count
                }
            });
        }

        booking = bookingDataResult;
        if (!booking) {
            console.error('❌ Booking insert returned null/undefined');
            return res.status(500).json({
                error: 'Failed to create booking',
                details: 'Database insert returned no data',
                hint: 'Check database connection and permissions'
            });
        }

        console.log(`✅ Booking created successfully: ${booking_reference} (ID: ${booking.id})`);

        // If we have connecting flights, try to update flight_segments (optional column)
        if (flightsToBook.length > 1) {
            try {
                const { error: updateSegmentsError } = await supabaseAdmin
                    .from('bookings')
                    .update({
                        flight_segments: flightsToBook.map(f => f.id)
                    })
                    .eq('id', booking.id);

                if (updateSegmentsError) {
                    // Column doesn't exist or other error - not critical, just log it
                    console.log('⚠️  Could not update flight_segments (column may not exist):', updateSegmentsError.message);
                } else {
                    console.log(`  📦 Updated flight_segments with ${flightsToBook.length} segments`);
                }
            } catch (segmentsError) {
                console.log('⚠️  flight_segments update failed (non-critical):', segmentsError.message);
            }
        }

        // Insert passengers - validate required fields
        // Note: gender column doesn't exist in schema, so we don't include it
        const passengerRecords = passengers.map((p, index) => {
            if (!p.first_name || !p.last_name) {
                throw new Error(`Passenger ${index + 1}: first_name and last_name are required`);
            }
            return {
                booking_id: booking.id,
                first_name: p.first_name.trim(),
                last_name: p.last_name.trim(),
                date_of_birth: p.date_of_birth || null,
                passport_number: p.passport_number || null,
                nationality: p.nationality || null
                // gender column doesn't exist in schema, so we skip it
            };
        });

        console.log(`👥 Inserting ${passengerRecords.length} passenger(s)...`);
        console.log('👥 Passenger records:', passengerRecords.map(p => `${p.first_name} ${p.last_name}`).join(', '));

        const { error: passengersError } = await supabaseAdmin
            .from('passengers')
            .insert(passengerRecords);

        if (passengersError) {
            console.error('❌ Passengers insert error:', passengersError);
            console.error('❌ Passenger error code:', passengersError.code);
            console.error('❌ Passenger error details:', passengersError.details);

            // Rollback booking
            try {
                await supabaseAdmin.from('bookings').delete().eq('id', booking.id);
                console.log('🗑️  Booking rolled back due to passenger insert failure');
            } catch (rollbackError) {
                console.error('❌ Failed to rollback booking:', rollbackError);
            }

            return res.status(500).json({
                error: 'Failed to add passengers',
                details: passengersError.message || 'Unknown passenger insert error',
                code: passengersError.code,
                hint: passengersError.hint || 'Check passengers table schema and required fields'
            });
        }

        console.log(`✅ Passengers added successfully`);

        // Update flight capacity atomically for all segments
        console.log(`🔄 Updating capacity for ${flightsToBook.length} flight segment(s)...`);

        for (const flightSegment of flightsToBook) {
            const { error: updateError } = await supabaseAdmin
                .from('flights')
                .update({
                    available_capacity: flightSegment.available_capacity - passengerCount
                })
                .eq('id', flightSegment.id)
                .eq('available_capacity', flightSegment.available_capacity); // Optimistic lock

            if (updateError) {
                console.error(`❌ Failed to update capacity for flight ${flightSegment.id}:`, updateError);
                // Rollback
                await supabaseAdmin.from('passengers').delete().eq('booking_id', booking.id);
                await supabaseAdmin.from('bookings').delete().eq('id', booking.id);
                return res.status(409).json({
                    error: 'Seat availability changed, please try again',
                    details: `Flight ${flightSegment.flight_number} capacity update failed`
                });
            }

            console.log(`  ✓ Updated capacity for ${flightSegment.flight_number}: ${flightSegment.available_capacity} → ${flightSegment.available_capacity - passengerCount}`);
        }

        // Invalidate cache for all flight segments and related searches
        for (const flightSegment of flightsToBook) {
            await cache.del(cache.CACHE_KEYS.FLIGHT_DETAIL(flightSegment.id));
        }
        await cache.delByPattern('cache:search:*'); // Clear all search caches
        console.log('🗑️  Cache invalidated after booking');

        // Deduct miles if used
        if (points_used > 0) {
            await supabaseAdmin
                .from('miles_members')
                .update({ total_points: supabaseAdmin.rpc('decrement_points', { p_id: miles_member_id, p_amount: points_used }) })
                .eq('id', miles_member_id);

            // Record in ledger
            await supabaseAdmin
                .from('miles_ledger')
                .insert({
                    member_id: miles_member_id,
                    transaction_type: 'REDEEMED',
                    points: -points_used,
                    description: `Redeemed for booking ${booking_reference}`,
                    flight_id: mainFlight.id, // Use primary flight ID
                    booking_id: booking.id,
                    source: 'Flight Booking'
                });
        }

        // Credit miles immediately after booking (if miles member)
        if (miles_member_id) {
            try {
                console.log(`💰 Attempting to credit miles for member: ${miles_member_id}`);
                console.log(`   Number of flight segments: ${flightsToBook.length}`);

                // Log each segment's duration
                flightsToBook.forEach((flight, index) => {
                    console.log(`   Segment ${index + 1} (${flight.flight_number}): ${flight.duration_minutes || 0} minutes`);
                });

                // Calculate total duration (sum of all segments for connecting flights)
                const totalDurationMinutes = flightsToBook.reduce((sum, flight) => {
                    const duration = flight.duration_minutes || 0;
                    console.log(`   Adding segment duration: ${duration} minutes (total so far: ${sum + duration})`);
                    return sum + duration;
                }, 0);

                console.log(`   Total flight duration: ${totalDurationMinutes} minutes, Passengers: ${passengerCount}`);
                console.log(`   Total points to credit: ${totalDurationMinutes * passengerCount}`);

                // Call miles service to credit points immediately
                const milesServiceUrl = process.env.MILES_SERVICE_URL || 'http://localhost:3002';
                const serviceApiKey = process.env.SERVICE_API_KEY || 'se4458_flight_system_secret_key_2024';

                console.log(`   Calling miles service: ${milesServiceUrl}/api/v1/miles/credit-booking`);

                const creditResponse = await fetch(`${milesServiceUrl}/api/v1/miles/credit-booking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': serviceApiKey
                    },
                    body: JSON.stringify({
                        member_id: miles_member_id,
                        booking_id: booking.id,
                        flight_id: mainFlight.id,
                        duration_minutes: totalDurationMinutes,
                        passenger_count: passengerCount
                    })
                });

                if (creditResponse.ok) {
                    const creditData = await creditResponse.json();
                    console.log(`✅ Miles credited immediately: ${creditData.points_credited} points to member ${creditData.member_number}`);
                } else {
                    const errorData = await creditResponse.json().catch(() => ({ error: 'Unknown error' }));
                    console.error('⚠️  Failed to credit miles immediately:', errorData.error || 'Unknown error');
                    console.error('   Response status:', creditResponse.status);
                    // Don't fail the booking if miles credit fails
                }
            } catch (creditError) {
                console.error('⚠️  Error calling miles service for immediate credit:', creditError.message);
                console.error('   Error stack:', creditError.stack);
                // Don't fail the booking if miles credit fails
            }
        } else {
            console.log('ℹ️  No miles_member_id provided, skipping miles credit');
        }

        // Queue booking confirmation email
        // Get airport codes for email (origin and destination are UUIDs, not objects)
        const firstFlight = flightsToBook[0];
        const lastFlight = flightsToBook[flightsToBook.length - 1];
        const originAirportId = firstFlight.origin;
        const destAirportId = lastFlight.destination;

        let originCode = 'N/A';
        let destCode = 'N/A';
        let originCity = '';
        let destCity = '';

        // First, try to get from flight object if already populated (from join)
        if (firstFlight.origin && typeof firstFlight.origin === 'object' && firstFlight.origin.code) {
            originCode = firstFlight.origin.code;
            originCity = firstFlight.origin.city || '';
            console.log('✅ Got origin from flight object:', originCode);
        }
        if (lastFlight.destination && typeof lastFlight.destination === 'object' && lastFlight.destination.code) {
            destCode = lastFlight.destination.code;
            destCity = lastFlight.destination.city || '';
            console.log('✅ Got destination from flight object:', destCode);
        }

        // If not found in flight object, fetch from database
        if (originCode === 'N/A' && originAirportId) {
            try {
                const { data: originAirport, error: originError } = await supabaseAdmin
                    .from('airports')
                    .select('code, city')
                    .eq('id', originAirportId)
                    .maybeSingle();

                if (originError) {
                    console.error('❌ Error fetching origin airport:', originError);
                } else if (originAirport) {
                    originCode = originAirport.code;
                    originCity = originAirport.city || '';
                    console.log('✅ Fetched origin airport from DB:', originCode);
                } else {
                    console.log('⚠️  Origin airport not found in DB for ID:', originAirportId);
                }
            } catch (airportError) {
                console.error('❌ Exception fetching origin airport:', airportError.message);
            }
        }

        if (destCode === 'N/A' && destAirportId) {
            try {
                const { data: destAirport, error: destError } = await supabaseAdmin
                    .from('airports')
                    .select('code, city')
                    .eq('id', destAirportId)
                    .maybeSingle();

                if (destError) {
                    console.error('❌ Error fetching destination airport:', destError);
                } else if (destAirport) {
                    destCode = destAirport.code;
                    destCity = destAirport.city || '';
                    console.log('✅ Fetched destination airport from DB:', destCode);
                } else {
                    console.log('⚠️  Destination airport not found in DB for ID:', destAirportId);
                }
            } catch (airportError) {
                console.error('❌ Exception fetching destination airport:', airportError.message);
            }
        }

        // Final validation - log if still N/A
        if (originCode === 'N/A' || destCode === 'N/A') {
            console.error('⚠️  WARNING: Airport codes still N/A after all attempts!', {
                originId: originAirportId,
                destId: destAirportId,
                firstFlight: firstFlight.id,
                lastFlight: lastFlight.id
            });
        }

        const flightNumbers = flightsToBook.map(f => f.flight_number).join(' + ');
        const route = flightsToBook.length > 1
            ? `${originCode} → ${destCode} (${flightsToBook.length} segments)`
            : `${originCode} → ${destCode}`;

        // Final check - if still N/A, log warning but send anyway
        if (originCode === 'N/A' || destCode === 'N/A') {
            console.error('❌ CRITICAL: Sending email with N/A route!', {
                originCode,
                destCode,
                originId: originAirportId,
                destId: destAirportId,
                flightIds: flightsToBook.map(f => f.id)
            });
        } else {
            console.log(`✅ Email route prepared: ${originCode} → ${destCode}`);
        }

        // Format passenger names for email
        const passengerNames = passengers.map(p => `${p.first_name} ${p.last_name}`);

        queueBookingEmail({
            contact_email,
            booking_reference,
            flight_number: flightNumbers,
            origin: originCode,
            origin_city: originCity,
            destination: destCode,
            destination_city: destCity,
            departure_time: mainFlight.departure_time,
            passengers: passengerCount,
            passenger_names: passengerNames,
            total_price,
            is_connecting: flightsToBook.length > 1
        });

        console.log('📧 Email queued with route:', `${originCode} → ${destCode}`);

        res.status(201).json({
            message: 'Booking confirmed',
            booking: {
                id: booking.id,
                booking_reference,
                flight_id: mainFlight.id, // Primary flight ID
                flight_segments: flightsToBook.length > 1 ? flightsToBook.map(f => f.id) : [mainFlight.id],
                passenger_count: passengerCount,
                total_price,
                points_used,
                payment_method,
                status: 'CONFIRMED',
                contact_email,
                route: route,
                flight_numbers: flightNumbers
            }
        });

        console.log(`🎉 Booking completed successfully: ${booking_reference}`);

    } catch (error) {
        console.error('❌ Error creating booking:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);
        console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'Unknown error',
            errorType: error.name,
            hint: 'Check server logs for more details. Common issues: database connection, missing columns, or constraint violations.'
        });
    }
});

// GET /api/v1/tickets/:reference - Get booking by reference
app.get('/api/v1/tickets/:reference', async (req, res) => {
    try {
        const { reference } = req.params;

        const { data: booking, error } = await supabaseAdmin
            .from('bookings')
            .select(`
        *,
        flight:flights(*,
          origin:airports!flights_origin_airport_id_fkey(code, name, city),
          destination:airports!flights_destination_airport_id_fkey(code, name, city)
        ),
        passengers(*)
      `)
            .eq('booking_reference', reference.toUpperCase())
            .single();

        if (error || !booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ booking });

    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`✈️  Flight Service running on http://localhost:${PORT}`);
});
