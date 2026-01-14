require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const amqp = require('amqplib');
const { requireAuth, requireRole, requireServiceAuth, ROLES } = require('./middleware/auth');
const { supabase, supabaseAdmin } = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// RABBITMQ CONFIGURATION
// ============================================
let rabbitChannel = null;
let rabbitRetryCount = 0;
const MAX_RABBIT_RETRIES = 5;
const RABBIT_CONNECT_TIMEOUT = 5000; // 5 seconds

const QUEUES = {
    WELCOME_EMAIL: 'welcome_email_queue',
    POINTS_NOTIFICATION: 'points_notification_queue'
};

const connectRabbitMQ = async () => {
    try {
        if (!process.env.RABBITMQ_URL) {
            console.log('⚠️  RABBITMQ_URL not configured - queue functionality disabled');
            return;
        }

        if (rabbitRetryCount >= MAX_RABBIT_RETRIES) {
            console.log(`⚠️  RabbitMQ max retries (${MAX_RABBIT_RETRIES}) reached. Queue functionality disabled.`);
            console.log('   Restart the service to try again.');
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

        // Declare queues
        await rabbitChannel.assertQueue(QUEUES.WELCOME_EMAIL, { durable: true });
        await rabbitChannel.assertQueue(QUEUES.POINTS_NOTIFICATION, { durable: true });

        console.log('✅ Connected to RabbitMQ');
        rabbitRetryCount = 0; // Reset on successful connection

        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err.message);
            rabbitChannel = null;
            if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
                setTimeout(connectRabbitMQ, 5000);
            }
        });

        connection.on('close', () => {
            console.log('RabbitMQ connection closed');
            rabbitChannel = null;
            if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
                setTimeout(connectRabbitMQ, 5000);
            }
        });

    } catch (error) {
        console.log('⚠️  RabbitMQ connection failed:', error.message);
        rabbitChannel = null;

        if (rabbitRetryCount < MAX_RABBIT_RETRIES) {
            const retryDelay = Math.min(10000, 2000 * rabbitRetryCount); // Exponential backoff, max 10s
            console.log(`   Retrying in ${retryDelay / 1000} seconds... (${rabbitRetryCount}/${MAX_RABBIT_RETRIES})`);
            setTimeout(connectRabbitMQ, retryDelay);
        } else {
            console.log('   Max retries reached. Queue functionality disabled.');
        }
    }
};

// Initialize RabbitMQ connection (non-blocking)
if (process.env.RABBITMQ_URL) {
    setImmediate(connectRabbitMQ);
}

// Helper function to send message to queue
const sendToQueue = async (queueName, message) => {
    if (!rabbitChannel) {
        console.log(`⚠️  Queue not available, message not sent: ${queueName}`);
        return false;
    }

    try {
        rabbitChannel.sendToQueue(
            queueName,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );
        console.log(`📤 Message queued to ${queueName}`);
        return true;
    } catch (error) {
        console.error(`Error sending message to ${queueName}:`, error);
        return false;
    }
};

// ============================================
// HEALTH ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'miles-service', timestamp: new Date().toISOString() });
});

app.get('/api/v1/miles/health', (req, res) => {
    res.json({ status: 'ok', endpoint: 'miles', timestamp: new Date().toISOString() });
});

// ============================================
// PASSWORD RESET ENDPOINT
// ============================================

// POST /api/v1/miles/request-password-reset - Request password reset
app.post('/api/v1/miles/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user exists
        const { data: member, error: memberError } = await supabaseAdmin
            .from('miles_members')
            .select('email, user_id')
            .eq('email', email)
            .single();

        // Don't reveal if email exists or not (security best practice)
        if (memberError || !member) {
            // Return success even if user doesn't exist
            return res.json({ message: 'If this email is registered, you will receive a password reset link' });
        }

        // Generate password reset link using Supabase
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
        });

        if (error) {
            console.error('Error generating reset link:', error);
            return res.status(500).json({ error: 'Failed to generate reset link' });
        }

        // Send email via notification service
        try {
            const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';
            const resetLink = data.properties.action_link;

            const notificationResponse = await fetch(`${NOTIFICATION_SERVICE_URL}/api/v1/notifications/password-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    reset_link: resetLink
                })
            });

            if (!notificationResponse.ok) {
                console.error('Failed to send reset email via notification service');
            } else {
                console.log(`📧 Password reset email sent to ${email}`);
            }
        } catch (notifError) {
            console.error('Error calling notification service:', notifError);
            // Don't fail the request if email fails to send
        }

        res.json({ message: 'If this email is registered, you will receive a password reset link' });

    } catch (error) {
        console.error('Error in password reset:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// MEMBER ENDPOINTS
// ============================================

// POST /api/v1/miles/members - Create new MilesSmiles membership
app.post('/api/v1/miles/members', async (req, res) => {
    try {
        const { email, first_name, last_name, phone, user_id = null } = req.body;

        if (!email || !first_name || !last_name) {
            return res.status(400).json({
                error: 'Missing required fields: email, first_name, last_name'
            });
        }

        // Generate member number
        const { data: lastMember } = await supabaseAdmin
            .from('miles_members')
            .select('member_number')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let memberNo = 'MS00000001';
        if (lastMember?.member_number) {
            const lastNum = parseInt(lastMember.member_number.substring(2));
            memberNo = 'MS' + String(lastNum + 1).padStart(8, '0');
        }

        let userId = user_id;

        // If no user_id provided (public registration), create Supabase Auth user
        if (!userId) {
            const { password } = req.body;
            if (!password) {
                return res.status(400).json({ error: 'Password required for new registration' });
            }

            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { first_name, last_name, role: 'MEMBER' }
            });

            if (authError) {
                console.error('Error creating auth user:', authError);
                return res.status(400).json({ error: 'Failed to create login account: ' + authError.message });
            }
            userId = authData.user.id;
        }

        const { data: member, error } = await supabaseAdmin
            .from('miles_members')
            .insert({
                user_id: userId,
                member_number: memberNo,
                email,
                first_name,
                last_name,
                phone,
                total_points: 0,
                tier: 'CLASSIC'
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating member:', error);
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Member already exists with this email or user_id' });
            }
            return res.status(500).json({ error: 'Failed to create membership' });
        }

        // Welcome email is now sent manually after email confirmation
        // See POST /api/v1/miles/members/:id/welcome-email

        res.status(201).json({
            message: 'Membership created successfully',
            member: {
                id: member.id,
                member_number: member.member_number,
                email: member.email,
                first_name: member.first_name,
                last_name: member.last_name,
                total_points: member.total_points,
                tier: member.tier
            }
        });

    } catch (error) {
        console.error('Error creating membership:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// GET /api/v1/miles/members/by-user/:userId - Get member by Supabase user ID (public)
app.get('/api/v1/miles/members/by-user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data: member, error } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        res.json({ member });
    } catch (error) {
        console.error('Error fetching member by user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Track members who already received welcome email (in-memory, resets on restart)
const welcomeEmailSentSet = new Set();

// POST /api/v1/miles/members/:id/welcome-email - Manually send welcome email
app.post('/api/v1/miles/members/:id/welcome-email', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch member details
        const { data: member, error } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('user_id', id)  // First try by user_id
            .maybeSingle();

        // If not found by user_id, try by member id (UUID)
        let finalMember = member;
        if (!member) {
            const { data: memberById } = await supabaseAdmin
                .from('miles_members')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            finalMember = memberById;
        }

        if (!finalMember) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Check if welcome email was already sent (prevent duplicates)
        if (welcomeEmailSentSet.has(finalMember.id)) {
            console.log(`⚠️ Welcome email already sent for member ${finalMember.member_number}, skipping`);
            return res.json({ message: 'Welcome email already sent', skipped: true });
        }

        // Queue welcome email
        await sendToQueue(QUEUES.WELCOME_EMAIL, {
            email: finalMember.email,
            first_name: finalMember.first_name,
            last_name: finalMember.last_name,
            member_number: finalMember.member_number,
            tier: finalMember.tier
        });

        // Mark as sent
        welcomeEmailSentSet.add(finalMember.id);

        console.log(`📧 Welcome email queued manually for member ${finalMember.member_number}`);
        res.json({ message: 'Welcome email queued successfully' });

    } catch (error) {
        console.error('Error sending welcome email:', error);
        res.status(500).json({ error: 'Failed to send welcome email' });
    }
});

// GET /api/v1/miles/members/:id - Get member details
app.get('/api/v1/miles/members/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: member, error } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Verify user owns this membership or is admin
        if (req.user.id !== member.user_id && req.userRole !== ROLES.ADMIN) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ member });

    } catch (error) {
        console.error('Error fetching member:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/miles/members/:id/history - Get points history
app.get('/api/v1/miles/members/:id/history', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const { data: ledger, error, count } = await supabaseAdmin
            .from('miles_ledger')
            .select('*', { count: 'exact' })
            .eq('member_id', id)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch history' });
        }

        res.json({
            history: ledger,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/v1/miles/members/:id - Delete member account and all data
app.delete('/api/v1/miles/members/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get member details
        const { data: member, error: memberError } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('id', id)
            .single();

        if (memberError || !member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Verify user owns this membership
        if (req.user.id !== member.user_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        console.log(`🗑️  Starting account deletion for member ${member.member_number}...`);

        // 1. Delete miles member record
        // The database schema now handles cascading deletes for ledger and setting bookings to NULL
        if (!supabaseAdmin) {
            console.error('❌ supabaseAdmin is not configured!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const { error: deleteMemberError } = await supabaseAdmin
            .from('miles_members')
            .delete()
            .eq('id', id);

        if (deleteMemberError) {
            console.error('❌ Error deleting member:', deleteMemberError);
            console.error('   Error details:', JSON.stringify(deleteMemberError, null, 2));

            // Helpful error message for foreign key violations if migration wasn't run
            if (deleteMemberError.code === '23503') { // Foreign key violation error code
                return res.status(500).json({
                    error: 'Failed to delete account. There are still booking records linked to this account.',
                    details: 'Please ensure the database migration schema has been applied.'
                });
            }

            return res.status(500).json({
                error: 'Failed to delete member record',
                details: deleteMemberError.message || 'Unknown error'
            });
        }

        console.log('   ✓ Deleted miles member record and related data (via cascade)');

        // 2. Delete Supabase Auth user
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(member.user_id);

        if (authDeleteError) {
            console.error('Error deleting auth user:', authDeleteError);
            // Continue even if auth deletion fails - member data is already deleted
        } else {
            console.log('   ✓ Deleted Supabase Auth user');
        }

        console.log(`✅ Account deletion complete for ${member.email}`);

        res.json({
            message: 'Miles&Smiles account deleted successfully.',
            deleted: {
                member_number: member.member_number,
                email: member.email
            }
        });

    } catch (error) {
        console.error('❌ Error deleting account:', error);
        console.error('   Error stack:', error.stack);
        console.error('   Error message:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'Unknown error occurred'
        });
    }
});

// ============================================
// SERVICE-TO-SERVICE ENDPOINT (Other Airlines)
// ============================================

// POST /api/v1/miles/add - Add miles from partner airline
// Requires SERVICE_OTHER_AIRLINE role or service API key
app.post('/api/v1/miles/add', requireServiceAuth, async (req, res) => {
    try {
        const {
            member_number,
            points,
            description,
            source = 'Partner Airline'
        } = req.body;

        if (!member_number || !points || points <= 0) {
            return res.status(400).json({
                error: 'Missing required fields: member_number, points (must be positive)'
            });
        }

        // Find member
        const { data: member, error: memberError } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('member_number', member_number)
            .single();

        if (memberError || !member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Update points
        const { error: updateError } = await supabaseAdmin
            .from('miles_members')
            .update({ total_points: member.total_points + points })
            .eq('id', member.id);

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update points' });
        }

        // Record in ledger
        const { error: ledgerError } = await supabaseAdmin
            .from('miles_ledger')
            .insert({
                member_id: member.id,
                transaction_type: 'PARTNER_CREDIT',
                points,
                description: description || `Points credited by ${source}`,
                source
            });

        if (ledgerError) {
            console.error('Ledger error:', ledgerError);
        }

        console.log(`✅ Added ${points} points to member ${member_number} from ${source}`);

        res.json({
            message: 'Points added successfully',
            member_number,
            points_added: points,
            new_total: member.total_points + points,
            source
        });

    } catch (error) {
        console.error('Error adding miles:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// NIGHTLY JOB: Update miles for completed flights
// ============================================

const processCompletedFlights = async () => {
    console.log('🌙 Starting nightly miles processing...');

    try {
        // First get already processed flight IDs
        const { data: processedFlights } = await supabaseAdmin
            .from('processed_flight_miles')
            .select('flight_id');

        const processedFlightIds = new Set((processedFlights || []).map(p => p.flight_id));
        console.log(`   Already processed flights: ${processedFlightIds.size}`);

        // Get flights that departed before now (past flights) - check by departure time
        const now = new Date().toISOString();
        const { data: allPastFlights, error: flightsError } = await supabaseAdmin
            .from('flights')
            .select('id, departure_time, status')
            .lt('departure_time', now); // Flights that have already departed

        if (flightsError) {
            console.error('Error fetching flights:', flightsError);
            return;
        }

        // Filter out already processed flights in JavaScript
        const completedFlights = (allPastFlights || []).filter(f => !processedFlightIds.has(f.id));
        console.log(`   Past flights to process: ${completedFlights.length}`);

        if (!completedFlights || completedFlights.length === 0) {
            console.log('No new completed flights to process');
            return;
        }

        let totalBookingsProcessed = 0;
        let totalPointsAwarded = 0;
        const membersToNotify = [];

        for (const flight of completedFlights) {
            console.log(`   Processing flight ${flight.id}...`);

            // Get bookings with miles members for this flight
            const { data: bookings, error: bookingsError } = await supabaseAdmin
                .from('bookings')
                .select(`
          *,
          miles_member:miles_members(*)
        `)
                .eq('flight_id', flight.id)
                .not('miles_member_id', 'is', null)
                .eq('status', 'CONFIRMED');

            if (bookingsError) {
                console.error(`Error fetching bookings for flight ${flight.id}:`, bookingsError);
                continue;
            }

            console.log(`     Found ${bookings?.length || 0} bookings with miles members`);

            // Get flight details for distance calculation
            const { data: flightDetails } = await supabaseAdmin
                .from('flights')
                .select('duration_minutes')
                .eq('id', flight.id)
                .single();

            // Calculate points: 1 point per minute of flight (simplified)
            const pointsPerPassenger = flightDetails?.duration_minutes || 100;

            for (const booking of bookings) {
                if (!booking.miles_member) continue;

                const totalPoints = pointsPerPassenger * booking.passenger_count;

                // Add points to member
                await supabaseAdmin
                    .from('miles_members')
                    .update({
                        total_points: booking.miles_member.total_points + totalPoints
                    })
                    .eq('id', booking.miles_member.id);

                // Record in ledger
                await supabaseAdmin
                    .from('miles_ledger')
                    .insert({
                        member_id: booking.miles_member.id,
                        transaction_type: 'EARNED',
                        points: totalPoints,
                        description: `Earned from flight booking ${booking.booking_reference}`,
                        flight_id: flight.id,
                        booking_id: booking.id,
                        source: 'Flight Completion'
                    });

                totalBookingsProcessed++;
                totalPointsAwarded += totalPoints;

                // Track for notification
                if (!membersToNotify.find(m => m.id === booking.miles_member.id)) {
                    membersToNotify.push({
                        id: booking.miles_member.id,
                        email: booking.miles_member.email,
                        first_name: booking.miles_member.first_name,
                        points_earned: totalPoints
                    });
                } else {
                    const existing = membersToNotify.find(m => m.id === booking.miles_member.id);
                    existing.points_earned += totalPoints;
                }
            }

            // Mark flight as processed
            await supabaseAdmin
                .from('processed_flight_miles')
                .insert({
                    flight_id: flight.id,
                    bookings_processed: bookings.length,
                    points_awarded: bookings.reduce((sum, b) => sum + (pointsPerPassenger * b.passenger_count), 0)
                });
        }

        console.log(`✅ Nightly processing complete:`);
        console.log(`   Flights processed: ${completedFlights.length}`);
        console.log(`   Bookings processed: ${totalBookingsProcessed}`);
        console.log(`   Total points awarded: ${totalPointsAwarded}`);
        console.log(`   Members to notify: ${membersToNotify.length}`);

        // Queue notifications for members via RabbitMQ
        for (const member of membersToNotify) {
            // Get updated total points
            const { data: updatedMember } = await supabaseAdmin
                .from('miles_members')
                .select('total_points')
                .eq('id', member.id)
                .single();

            await sendToQueue(QUEUES.POINTS_NOTIFICATION, {
                email: member.email,
                first_name: member.first_name,
                points_earned: member.points_earned,
                new_total: updatedMember?.total_points || 0
            });
        }

    } catch (error) {
        console.error('Error in nightly processing:', error);
    }
};

// Schedule nightly job at 2 AM
cron.schedule('0 2 * * *', () => {
    processCompletedFlights();
});

// Manual trigger endpoint for testing
app.post('/api/v1/miles/process-flights', requireServiceAuth, async (req, res) => {
    await processCompletedFlights();
    res.json({ message: 'Nightly processing triggered' });
});

// DEV ONLY: Manual trigger without auth (remove in production)
app.get('/api/v1/miles/trigger-nightly', async (req, res) => {
    console.log('🔧 Manual nightly trigger requested');
    await processCompletedFlights();
    res.json({ message: 'Nightly processing completed', timestamp: new Date().toISOString() });
});

// DEV ONLY: Credit miles for existing bookings that don't have miles yet
app.get('/api/v1/miles/credit-existing-bookings', async (req, res) => {
    try {
        console.log('🔧 Credit existing bookings requested');

        // Get all confirmed bookings with miles_member_id but no miles ledger entry
        const { data: bookings, error: bookingsError } = await supabaseAdmin
            .from('bookings')
            .select(`
                id,
                miles_member_id,
                flight_id,
                passenger_count,
                flights:flight_id (
                    id,
                    duration_minutes
                )
            `)
            .eq('status', 'CONFIRMED')
            .not('miles_member_id', 'is', null);

        if (bookingsError) {
            return res.status(500).json({ error: 'Failed to fetch bookings', details: bookingsError });
        }

        if (!bookings || bookings.length === 0) {
            return res.json({ message: 'No bookings to process', count: 0 });
        }

        // Get already credited booking IDs from ledger
        const { data: creditedBookings } = await supabaseAdmin
            .from('miles_ledger')
            .select('booking_id')
            .eq('transaction_type', 'EARNED')
            .eq('source', 'Immediate Booking Credit');

        const creditedBookingIds = new Set((creditedBookings || []).map(b => b.booking_id));

        let processed = 0;
        let errors = 0;

        for (const booking of bookings) {
            // Skip if already credited
            if (creditedBookingIds.has(booking.id)) {
                continue;
            }

            if (!booking.miles_member_id || !booking.flights) {
                continue;
            }

            // For connecting flights, we need to get all segments
            // Since flight_segments column doesn't exist, we'll use the booking's flight_id
            // and check if there are other bookings with the same reference (not ideal but works)
            // Actually, let's check the flight's route to see if it's part of a connecting flight
            // For now, use the single flight duration - this will be fixed when flight_segments column is added
            let totalDuration = booking.flights.duration_minutes || 0;

            // Try to get flight_segments if it exists (some bookings might have it in JSONB)
            // For now, we'll use a workaround: check if booking has multiple segments by looking at the route
            // This is a temporary fix until flight_segments column is properly implemented

            const totalPoints = totalDuration * (booking.passenger_count || 1);

            if (totalPoints <= 0) continue;

            console.log(`   Processing booking ${booking.id}: ${totalDuration} minutes, ${totalPoints} points`);

            try {
                // Get member
                const { data: member } = await supabaseAdmin
                    .from('miles_members')
                    .select('total_points')
                    .eq('id', booking.miles_member_id)
                    .single();

                if (!member) continue;

                // Update member points
                await supabaseAdmin
                    .from('miles_members')
                    .update({
                        total_points: member.total_points + totalPoints
                    })
                    .eq('id', booking.miles_member_id);

                // Record in ledger
                await supabaseAdmin
                    .from('miles_ledger')
                    .insert({
                        member_id: booking.miles_member_id,
                        transaction_type: 'EARNED',
                        points: totalPoints,
                        description: `Earned from booking (${booking.passenger_count} passenger${booking.passenger_count > 1 ? 's' : ''})`,
                        flight_id: booking.flight_id,
                        booking_id: booking.id,
                        source: 'Immediate Booking Credit'
                    });

                processed++;
                console.log(`   ✓ Credited ${totalPoints} miles for booking ${booking.id}`);
            } catch (err) {
                console.error(`   ✗ Error processing booking ${booking.id}:`, err.message);
                errors++;
            }
        }

        res.json({
            message: 'Existing bookings processed',
            total: bookings.length,
            processed,
            errors,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error crediting existing bookings:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// POST /api/v1/miles/credit-booking - Credit miles immediately after booking
// Called by flight-service when a booking is created with miles_member_id
app.post('/api/v1/miles/credit-booking', requireServiceAuth, async (req, res) => {
    try {
        const {
            member_id,
            booking_id,
            flight_id,
            duration_minutes,
            passenger_count
        } = req.body;

        if (!member_id || !booking_id || !flight_id || !duration_minutes || !passenger_count) {
            return res.status(400).json({
                error: 'Missing required fields: member_id, booking_id, flight_id, duration_minutes, passenger_count'
            });
        }

        // Get member
        const { data: member, error: memberError } = await supabaseAdmin
            .from('miles_members')
            .select('*')
            .eq('id', member_id)
            .single();

        if (memberError || !member) {
            return res.status(404).json({ error: 'Miles member not found' });
        }

        // Calculate points: 1 point per minute per passenger
        const totalPoints = duration_minutes * passenger_count;

        // Update member total points
        const { data: updatedMember, error: updateError } = await supabaseAdmin
            .from('miles_members')
            .update({
                total_points: member.total_points + totalPoints
            })
            .eq('id', member_id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating member points:', updateError);
            return res.status(500).json({ error: 'Failed to update member points' });
        }

        // Record in ledger
        const { error: ledgerError } = await supabaseAdmin
            .from('miles_ledger')
            .insert({
                member_id: member_id,
                transaction_type: 'EARNED',
                points: totalPoints,
                description: `Earned from booking (${passenger_count} passenger${passenger_count > 1 ? 's' : ''})`,
                flight_id: flight_id,
                booking_id: booking_id,
                source: 'Immediate Booking Credit'
            });

        if (ledgerError) {
            console.error('Error recording ledger entry:', ledgerError);
            // Don't fail the request, points were already added
        }

        console.log(`✅ Credited ${totalPoints} miles to member ${member.member_number} for booking ${booking_id}`);

        res.json({
            message: 'Miles credited successfully',
            member_number: member.member_number,
            points_credited: totalPoints,
            new_total: updatedMember.total_points
        });

    } catch (error) {
        console.error('Error crediting booking miles:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🎯 Miles Service running on http://localhost:${PORT}`);
    console.log('📅 Nightly job scheduled at 2:00 AM');
});
