require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// EMAIL CONFIGURATION (Gmail SMTP)
// ============================================
let emailConfigured = false;

// Try port 465 with direct SSL - different connection method that may bypass firewall
const transporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // Use direct SSL (not STARTTLS)
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        },
        connectionTimeout: 60000, // 60 second connection timeout
        greetingTimeout: 60000,   // 60 second greeting timeout
        socketTimeout: 120000,    // 120 second socket timeout
        logger: true,
        debug: true
    })
    : null;

// Verify email configuration on startup
const verifyEmail = async () => {
    if (!transporter) {
        console.log('⚠️  Email not configured - GMAIL_USER or GMAIL_APP_PASSWORD missing');
        return;
    }

    console.log('📧 Gmail SMTP configured:');
    console.log('   Host: smtp.gmail.com:587 (STARTTLS)');
    console.log('   User:', process.env.GMAIL_USER);
    console.log('   Attempting verification...');

    try {
        await transporter.verify();
        emailConfigured = true;
        console.log('✅ Gmail SMTP verified successfully!');
    } catch (error) {
        console.log('⚠️  Gmail verification failed:', error.message);
        console.log('   Will still attempt to send emails when triggered.');
        emailConfigured = true; // Still try to send
    }
};

// Non-blocking email verification
setImmediate(verifyEmail);

// ============================================
// RABBITMQ CONFIGURATION
// ============================================
let rabbitChannel = null;
let rabbitRetryCount = 0;
const MAX_RABBIT_RETRIES = 5;
const RABBIT_CONNECT_TIMEOUT = 5000; // 5 seconds

const QUEUES = {
    WELCOME_EMAIL: 'welcome_email_queue',
    POINTS_NOTIFICATION: 'points_notification_queue',
    BOOKING_CONFIRMATION: 'booking_confirmation_queue'
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
        await rabbitChannel.assertQueue(QUEUES.BOOKING_CONFIRMATION, { durable: true });

        console.log('✅ Connected to RabbitMQ');
        rabbitRetryCount = 0; // Reset on successful connection

        // Start consuming messages
        startConsumers();

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

// ============================================
// EMAIL SENDING FUNCTIONS
// ============================================

const sendWelcomeEmail = async (member) => {
    const tierBenefits = {
        'CLASSIC': ['Earn 1 mile per minute flown', 'Access to member-only deals', 'Birthday bonus miles'],
        'SILVER': ['Earn 1.25 miles per minute', 'Priority check-in', 'Extra baggage allowance', 'Lounge access discounts'],
        'GOLD': ['Earn 1.5 miles per minute', 'Priority boarding', 'Free seat selection', 'Lounge access'],
        'PLATINUM': ['Earn 2 miles per minute', 'Complimentary upgrades', 'Unlimited lounge access', 'Dedicated support line']
    };

    const benefits = tierBenefits[member.tier || 'CLASSIC'] || tierBenefits['CLASSIC'];
    const benefitsHtml = benefits.map(b => `<li style="padding: 8px 0; color: #475569;">✓ ${b}</li>`).join('');

    const mailOptions = {
        from: `"Turkish Airlines - Miles&Smiles" <${process.env.GMAIL_USER}>`,
        to: member.email,
        subject: '🎉 Welcome to Miles&Smiles - Your Journey Begins!',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                
                <!-- Header with Gradient -->
                <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 2px;">MILES&SMILES</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Premium Loyalty Program</p>
                </div>

                <!-- Welcome Banner -->
                <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 30px; text-align: center;">
                    <p style="color: #94a3b8; margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 3px;">Welcome Aboard</p>
                    <h2 style="color: white; margin: 0; font-size: 32px; font-weight: 300;">${member.first_name} ${member.last_name || ''}</h2>
                </div>

                <!-- Member Card -->
                <div style="padding: 30px;">
                    <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 16px; padding: 25px; color: white; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8;">Member Card</span>
                            <span style="background: ${member.tier === 'GOLD' ? '#fbbf24' : member.tier === 'SILVER' ? '#94a3b8' : member.tier === 'PLATINUM' ? '#a78bfa' : '#64748b'}; color: ${member.tier === 'GOLD' ? '#1e293b' : 'white'}; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">${member.tier || 'CLASSIC'}</span>
                        </div>
                        <p style="font-family: 'Courier New', monospace; font-size: 24px; letter-spacing: 4px; margin: 20px 0;">${member.member_number}</p>
                        <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
                            <div>
                                <p style="margin: 0; font-size: 11px; opacity: 0.7; text-transform: uppercase;">Member Since</p>
                                <p style="margin: 5px 0 0 0; font-size: 14px;">${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                            </div>
                            <div style="text-align: right;">
                                <p style="margin: 0; font-size: 11px; opacity: 0.7; text-transform: uppercase;">Available Miles</p>
                                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 600;">0</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Benefits Section -->
                <div style="padding: 0 30px 30px 30px;">
                    <h3 style="color: #1e293b; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Your ${member.tier || 'CLASSIC'} Benefits</h3>
                    <ul style="margin: 0; padding: 0; list-style: none;">
                        ${benefitsHtml}
                    </ul>
                </div>

                <!-- How to Earn -->
                <div style="background: #f8fafc; padding: 30px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="color: #1e293b; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">🎯 How to Earn Miles</h3>
                    <div style="display: grid; gap: 15px;">
                        <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626;">
                            <p style="margin: 0; font-weight: 600; color: #1e293b;">✈️ Fly with Us</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">Earn miles based on flight duration</p>
                        </div>
                        <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                            <p style="margin: 0; font-weight: 600; color: #1e293b;">🛍️ Partner Purchases</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">Earn miles with our retail partners</p>
                        </div>
                    </div>
                </div>

                <!-- CTA Button -->
                <div style="padding: 30px; text-align: center;">
                    <p style="color: #64748b; margin: 0 0 20px 0;">Ready to start your journey?</p>
                    <a href="#" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Book Your First Flight</a>
                </div>

                <!-- Footer -->
                <div style="background: #1e293b; color: white; padding: 30px; text-align: center;">
                    <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Miles&Smiles</p>
                    <p style="margin: 0; font-size: 12px; color: #94a3b8;">Your loyalty, rewarded.</p>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                        <p style="margin: 0; font-size: 11px; color: #64748b;">© 2026 FlightSystem - SE4458 Final Project</p>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #64748b;">This is an automated message. Please do not reply.</p>
                    </div>
                </div>

            </div>
        </body>
        </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Welcome email sent to ${member.email}`);
        return true;
    } catch (error) {
        console.error('Failed to send welcome email:', error);
        return false;
    }
};

const sendPointsNotificationEmail = async (member) => {
    const mailOptions = {
        from: `"Flight System" <${process.env.GMAIL_USER}>`,
        to: member.email,
        subject: '🎉 You earned MilesSmiles points!',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">🎉 Points Earned!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2>Great news, ${member.first_name}!</h2>
          <p>Your recent flight has earned you MilesSmiles points!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="color: #11998e; font-size: 24px;">+${member.points_earned} Points</h3>
            <p><strong>New Total:</strong> ${member.new_total} points</p>
          </div>
          <p>Keep flying to earn more rewards!</p>
        </div>
        <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
          <p>© 2024 Flight System - SE4458 Project</p>
        </div>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Points notification sent to ${member.email}`);
        return true;
    } catch (error) {
        console.error('Failed to send points notification:', error);
        return false;
    }
};


const sendBookingConfirmationEmail = async (booking) => {
    try {
        const {
            contact_email,
            booking_reference,
            flight_number,
            origin,
            origin_city,
            destination,
            destination_city,
            departure_time,
            arrival_time,
            duration_minutes,
            passengers,
            passenger_names,
            total_price,
            miles_earned,
            is_connecting
        } = booking;

        // Format dates
        let timeStr = departure_time;
        if (timeStr && !timeStr.endsWith('Z') && !timeStr.includes('+') && !timeStr.includes('-', 19)) {
            timeStr += 'Z';
        }
        const depDate = new Date(timeStr);
        const formattedDate = depDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            timeZone: 'UTC'
        });
        const formattedTime = depDate.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit',
            hour12: false,
            timeZone: 'UTC'
        });

        // Calculate arrival time if duration provided
        let arrivalTimeStr = '';
        if (duration_minutes) {
            const arrDate = new Date(depDate.getTime() + duration_minutes * 60000);
            arrivalTimeStr = arrDate.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit',
                hour12: false,
                timeZone: 'UTC'
            });
        }

        // Format duration
        const durationHours = duration_minutes ? Math.floor(duration_minutes / 60) : 0;
        const durationMins = duration_minutes ? duration_minutes % 60 : 0;
        const durationStr = duration_minutes ? `${durationHours}h ${durationMins}m` : '';

        // Build passenger list
        let passengerCardsHtml = '';
        if (passenger_names && Array.isArray(passenger_names) && passenger_names.length > 0) {
            passengerCardsHtml = passenger_names.map((name, index) => `
                <div style="background: #f8fafc; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #dc2626;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase;">Passenger ${index + 1}</p>
                            <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: 600; color: #1e293b;">${name.toUpperCase()}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="margin: 0; font-size: 11px; color: #64748b;">Seat</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${String.fromCharCode(65 + index)}${Math.floor(Math.random() * 30) + 1}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        const mailOptions = {
            from: `"Turkish Airlines" <${process.env.GMAIL_USER}>`,
            to: contact_email,
            subject: `✈️ E-Ticket Confirmation - ${booking_reference} | ${origin} → ${destination}`,
            html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 2px;">TURKISH AIRLINES</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">E-Ticket Confirmation</p>
                    </div>

                    <!-- Booking Reference Banner -->
                    <div style="background: #1e293b; padding: 25px; text-align: center;">
                        <p style="color: #94a3b8; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Confirmation Number</p>
                        <p style="color: #fbbf24; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 6px;">${booking_reference}</p>
                    </div>

                    <!-- Flight Card (Boarding Pass Style) -->
                    <div style="padding: 30px;">
                        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.15);">
                            
                            <!-- Flight Header -->
                            <div style="padding: 20px 25px; border-bottom: 2px dashed rgba(255,255,255,0.3);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase;">Flight</p>
                                        <p style="margin: 5px 0 0 0; color: white; font-size: 24px; font-weight: 700;">${flight_number || 'TK'}</p>
                                    </div>
                                    <div style="text-align: right;">
                                        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase;">Class</p>
                                        <p style="margin: 5px 0 0 0; color: white; font-size: 14px; font-weight: 600;">Economy</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Route Info -->
                            <div style="padding: 25px; color: white;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="text-align: center; flex: 1;">
                                        <p style="margin: 0; font-size: 42px; font-weight: 700;">${origin}</p>
                                        <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${origin_city || 'Departure'}</p>
                                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: 600;">${formattedTime}</p>
                                    </div>
                                    <div style="flex: 1; text-align: center; padding: 0 10px;">
                                        <p style="margin: 0; font-size: 11px; opacity: 0.7;">${durationStr || 'Direct'}</p>
                                        <div style="margin: 10px 0; border-top: 2px solid rgba(255,255,255,0.3); position: relative;">
                                            <span style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font-size: 16px;">✈️</span>
                                        </div>
                                        <p style="margin: 0; font-size: 11px; opacity: 0.7;">${is_connecting ? 'Connecting' : 'Non-stop'}</p>
                                    </div>
                                    <div style="text-align: center; flex: 1;">
                                        <p style="margin: 0; font-size: 42px; font-weight: 700;">${destination}</p>
                                        <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${destination_city || 'Arrival'}</p>
                                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: 600;">${arrivalTimeStr || '--:--'}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Date & Passengers -->
                            <div style="background: rgba(0,0,0,0.2); padding: 20px 25px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <div>
                                        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase;">Date</p>
                                        <p style="margin: 5px 0 0 0; color: white; font-size: 14px; font-weight: 600;">${formattedDate}</p>
                                    </div>
                                    <div style="text-align: right;">
                                        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase;">Passengers</p>
                                        <p style="margin: 5px 0 0 0; color: white; font-size: 14px; font-weight: 600;">${passengers} Traveler(s)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Passengers Section -->
                    <div style="padding: 0 30px 30px 30px;">
                        <h3 style="color: #1e293b; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">👥 Passenger Details</h3>
                        ${passengerCardsHtml || '<p style="color: #64748b; font-size: 14px;">Passenger details not available</p>'}
                    </div>

                    <!-- Price & Miles Summary -->
                    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase;">Total Amount</p>
                                <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: 700; color: #059669;">$${parseFloat(total_price).toFixed(2)}</p>
                            </div>
                            ${miles_earned ? `
                            <div style="text-align: right;">
                                <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase;">Miles Earned</p>
                                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #dc2626;">+${miles_earned}</p>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Important Info -->
                    <div style="padding: 25px 30px;">
                        <div style="background: #fef3c7; border-radius: 8px; padding: 20px; border-left: 4px solid #f59e0b;">
                            <h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">📋 Important Information</h4>
                            <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 13px; line-height: 1.8;">
                                <li>Please arrive at least 2 hours before domestic flights</li>
                                <li>Arrive 3 hours early for international flights</li>
                                <li>Bring a valid ID/Passport for check-in</li>
                                <li>Online check-in opens 24 hours before departure</li>
                            </ul>
                        </div>
                    </div>

                    <!-- Contact Support -->
                    <div style="padding: 0 30px 30px 30px; text-align: center;">
                        <p style="color: #64748b; font-size: 13px; margin: 0;">Need help? Contact our support team 24/7</p>
                        <p style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 8px 0 0 0;">+90 212 444 0 849</p>
                    </div>

                    <!-- Footer -->
                    <div style="background: #1e293b; color: white; padding: 30px; text-align: center;">
                        <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 600;">Thank you for flying with us!</p>
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">Wishing you a pleasant journey ✈️</p>
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                            <p style="margin: 0; font-size: 11px; color: #64748b;">© 2026 FlightSystem - SE4458 Final Project</p>
                        </div>
                    </div>

                </div>
            </body>
            </html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('📧 Booking confirmation email sent to', contact_email);
        return true;
    } catch (error) {
        console.error('Failed to send booking confirmation:', error);
        return false;
    }
};

const sendPasswordResetEmail = async (resetData) => {
    try {
        const { email, reset_link } = resetData;

        const mailOptions = {
            from: `"FlightSystem" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: '🔐 Reset Your Password - FlightSystem',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0;">🔐 Password Reset Request</h1>
                    </div>
                    <div style="padding: 30px; background: #f8fafc;">
                        <h2 style="color: #1e40af;">Reset Your Password</h2>
                        <p>We received a request to reset your password for your FlightSystem account.</p>
                        <p>Click the button below to reset your password:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${reset_link}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
                                Reset Password
                            </a>
                        </div>
                        
                        <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong></p>
                            <p style="margin: 10px 0 0 0; color: #856404;">This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.</p>
                        </div>
                        
                        <p style="margin-top: 25px; color: #64748b; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
                        <p style="color: #667eea; word-break: break-all; font-size: 12px;">${reset_link}</p>
                    </div>
                    <div style="background: #1e293b; color: white; padding: 20px; text-align: center; font-size: 12px;">
                        <p style="margin: 0;">© 2026 FlightSystem - SE4458 Final Project</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('📧 Password reset email sent to', email);
        return true;
    } catch (error) {
        console.error('Failed to send password reset email:', error);
        return false;
    }
};

// ============================================
// QUEUE CONSUMERS
// ============================================

const startConsumers = () => {
    if (!rabbitChannel) return;

    // Welcome email consumer
    rabbitChannel.consume(QUEUES.WELCOME_EMAIL, async (msg) => {
        if (msg) {
            try {
                const member = JSON.parse(msg.content.toString());
                console.log('📨 Processing welcome email for:', member.email);
                await sendWelcomeEmail(member);
                rabbitChannel.ack(msg);
            } catch (error) {
                console.error('Error processing welcome email:', error);
                rabbitChannel.nack(msg, false, true); // Requeue
            }
        }
    });

    // Points notification consumer
    rabbitChannel.consume(QUEUES.POINTS_NOTIFICATION, async (msg) => {
        if (msg) {
            try {
                const member = JSON.parse(msg.content.toString());
                console.log('📨 Processing points notification for:', member.email);
                await sendPointsNotificationEmail(member);
                rabbitChannel.ack(msg);
            } catch (error) {
                console.error('Error processing points notification:', error);
                rabbitChannel.nack(msg, false, true); // Requeue
            }
        }
    });

    // Booking confirmation consumer
    rabbitChannel.consume(QUEUES.BOOKING_CONFIRMATION, async (msg) => {
        if (msg) {
            try {
                const booking = JSON.parse(msg.content.toString());
                console.log('📨 Processing booking confirmation for:', booking.contact_email);
                await sendBookingConfirmationEmail(booking);
                rabbitChannel.ack(msg);
            } catch (error) {
                console.error('Error processing booking confirmation:', error);
                rabbitChannel.nack(msg, false, true);
            }
        }
    });

    console.log('📬 Queue consumers started');
};

// ============================================
// HEALTH ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'notification-service',
        timestamp: new Date().toISOString(),
        email_configured: !!process.env.GMAIL_USER,
        rabbitmq_connected: !!rabbitChannel
    });
});

app.get('/api/v1/notifications/health', (req, res) => {
    res.json({
        status: 'ok',
        endpoint: 'notifications',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// API ENDPOINTS (for internal service calls)
// ============================================

// POST /api/v1/notifications/welcome - Queue welcome email
app.post('/api/v1/notifications/welcome', async (req, res) => {
    try {
        const { member } = req.body;

        if (!member || !member.email) {
            return res.status(400).json({ error: 'Member data with email required' });
        }

        if (rabbitChannel) {
            // Queue the message
            rabbitChannel.sendToQueue(
                QUEUES.WELCOME_EMAIL,
                Buffer.from(JSON.stringify(member)),
                { persistent: true }
            );
            console.log('📤 Welcome email queued for:', member.email);
            res.json({ message: 'Welcome email queued', queued: true });
        } else {
            // Fallback: send directly if queue not available
            console.log('⚠️  Queue not available, sending directly...');
            await sendWelcomeEmail(member);
            res.json({ message: 'Welcome email sent directly', queued: false });
        }

    } catch (error) {
        console.error('Error queuing welcome email:', error);
        res.status(500).json({ error: 'Failed to queue email' });
    }
});

// POST /api/v1/notifications/points - Queue points notification
app.post('/api/v1/notifications/points', async (req, res) => {
    try {
        const { member } = req.body;

        if (!member || !member.email) {
            return res.status(400).json({ error: 'Member data with email required' });
        }

        if (rabbitChannel) {
            rabbitChannel.sendToQueue(
                QUEUES.POINTS_NOTIFICATION,
                Buffer.from(JSON.stringify(member)),
                { persistent: true }
            );
            console.log('📤 Points notification queued for:', member.email);
            res.json({ message: 'Points notification queued', queued: true });
        } else {
            await sendPointsNotificationEmail(member);
            res.json({ message: 'Points notification sent directly', queued: false });
        }

    } catch (error) {
        console.error('Error queuing points notification:', error);
        res.status(500).json({ error: 'Failed to queue notification' });
    }
});

// POST /api/v1/notifications/password-reset - Send password reset email
app.post('/api/v1/notifications/password-reset', async (req, res) => {
    try {
        const { email, reset_link } = req.body;

        if (!email || !reset_link) {
            return res.status(400).json({ error: 'Email and reset_link required' });
        }

        if (!transporter) {
            return res.status(503).json({ error: 'Email service not configured' });
        }

        await sendPasswordResetEmail({ email, reset_link });
        res.json({ message: 'Password reset email sent successfully' });

    } catch (error) {
        console.error('Failed to send password reset email:', error);
        res.status(500).json({ error: 'Failed to send password reset email', details: error.message });
    }
});

// POST /api/v1/notifications/test - Send a test email (for verification)
app.post('/api/v1/notifications/test', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email address required' });
        }

        const mailOptions = {
            from: `"Flight System Test" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: '🧪 Test Email - Flight System',
            text: 'This is a test email from the SE4458 Flight System notification service.',
            html: '<h1>Test Email</h1><p>This is a test email from the SE4458 Flight System notification service.</p>'
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Test email sent to ${email}`);
        res.json({ message: 'Test email sent successfully' });

    } catch (error) {
        console.error('Failed to send test email:', error);
        res.status(500).json({ error: 'Failed to send test email', details: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`📧 Notification Service running on http://localhost:${PORT}`);

    // Connect to RabbitMQ
    if (process.env.RABBITMQ_URL) {
        connectRabbitMQ();
    } else {
        console.log('⚠️  RABBITMQ_URL not configured - queue functionality disabled');
    }
});
