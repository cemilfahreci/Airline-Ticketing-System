-- ============================================
-- SE4458 Flight System - Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- AIRPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS airports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL, -- IATA code (e.g., IST, JFK)
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FLIGHTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS flights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flight_number VARCHAR(20) NOT NULL,
    origin_airport_id UUID NOT NULL REFERENCES airports(id),
    destination_airport_id UUID NOT NULL REFERENCES airports(id),
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    total_capacity INTEGER NOT NULL,
    available_capacity INTEGER NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    predicted_price DECIMAL(10, 2), -- ML predicted price
    is_direct BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- SCHEDULED, BOARDING, DEPARTED, LANDED, CANCELLED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT check_capacity CHECK (available_capacity >= 0 AND available_capacity <= total_capacity),
    CONSTRAINT check_different_airports CHECK (origin_airport_id != destination_airport_id)
);

-- ============================================
-- MILES MEMBERS TABLE (MilesSmiles)
-- ============================================
CREATE TABLE IF NOT EXISTS miles_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL, -- References Supabase Auth user
    member_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    total_points INTEGER DEFAULT 0,
    tier VARCHAR(50) DEFAULT 'CLASSIC', -- CLASSIC, SILVER, GOLD, ELITE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- MILES LEDGER TABLE (Points transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS miles_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES miles_members(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- EARNED, REDEEMED, BONUS, PARTNER_CREDIT
    points INTEGER NOT NULL,
    description TEXT,
    flight_id UUID REFERENCES flights(id),
    booking_id UUID, -- Will reference bookings table
    source VARCHAR(100), -- Our airline or partner airline name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- BOOKINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_reference VARCHAR(20) UNIQUE NOT NULL,
    flight_id UUID NOT NULL REFERENCES flights(id),
    user_id UUID, -- Supabase Auth user (nullable for guest)
    miles_member_id UUID REFERENCES miles_members(id) ON DELETE SET NULL,
    passenger_count INTEGER NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    points_used INTEGER DEFAULT 0, -- If paid with miles
    payment_method VARCHAR(50) NOT NULL, -- CASH, MILES, MIXED
    status VARCHAR(50) DEFAULT 'CONFIRMED', -- CONFIRMED, CANCELLED, COMPLETED
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key for miles_ledger.booking_id after bookings table exists
ALTER TABLE miles_ledger 
ADD CONSTRAINT fk_miles_ledger_booking 
FOREIGN KEY (booking_id) REFERENCES bookings(id);

-- ============================================
-- PASSENGERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS passengers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    passport_number VARCHAR(50),
    nationality VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PROCESSED FLIGHT MILES (Idempotency table for nightly job)
-- ============================================
CREATE TABLE IF NOT EXISTS processed_flight_miles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flight_id UUID NOT NULL REFERENCES flights(id),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    bookings_processed INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 0,
    
    CONSTRAINT unique_flight_processing UNIQUE (flight_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_flights_departure ON flights(departure_time);
CREATE INDEX IF NOT EXISTS idx_flights_origin ON flights(origin_airport_id);
CREATE INDEX IF NOT EXISTS idx_flights_destination ON flights(destination_airport_id);
CREATE INDEX IF NOT EXISTS idx_flights_status ON flights(status);
CREATE INDEX IF NOT EXISTS idx_bookings_flight ON bookings(flight_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(miles_member_id);
CREATE INDEX IF NOT EXISTS idx_miles_ledger_member ON miles_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_passengers_booking ON passengers(booking_id);

-- ============================================
-- SEED DATA: AIRPORTS
-- ============================================
INSERT INTO airports (code, name, city, country, latitude, longitude) VALUES
    ('IST', 'Istanbul Airport', 'Istanbul', 'Turkey', 41.2608, 28.7419),
    ('SAW', 'Sabiha Gokcen Airport', 'Istanbul', 'Turkey', 40.8986, 29.3092),
    ('ESB', 'Esenboga Airport', 'Ankara', 'Turkey', 40.1281, 32.9951),
    ('ADB', 'Adnan Menderes Airport', 'Izmir', 'Turkey', 38.2924, 27.1570),
    ('AYT', 'Antalya Airport', 'Antalya', 'Turkey', 36.8987, 30.8005),
    ('JFK', 'John F. Kennedy Airport', 'New York', 'USA', 40.6413, -73.7781),
    ('LHR', 'Heathrow Airport', 'London', 'UK', 51.4700, -0.4543),
    ('CDG', 'Charles de Gaulle Airport', 'Paris', 'France', 49.0097, 2.5479),
    ('FRA', 'Frankfurt Airport', 'Frankfurt', 'Germany', 50.0379, 8.5622),
    ('DXB', 'Dubai International Airport', 'Dubai', 'UAE', 25.2532, 55.3657)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE airports ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE miles_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE miles_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_flight_miles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Airports: Public read
CREATE POLICY "Airports are viewable by everyone" ON airports FOR SELECT USING (true);

-- Flights: Public read
CREATE POLICY "Flights are viewable by everyone" ON flights FOR SELECT USING (true);

-- Flights: Service role can insert/update
CREATE POLICY "Service role can manage flights" ON flights 
    FOR ALL USING (auth.role() = 'service_role');

-- Bookings: Users can view their own
CREATE POLICY "Users can view own bookings" ON bookings 
    FOR SELECT USING (auth.uid() = user_id);

-- Bookings: Service role can manage all
CREATE POLICY "Service role can manage bookings" ON bookings 
    FOR ALL USING (auth.role() = 'service_role');

-- Miles members: Users can view own
CREATE POLICY "Users can view own miles membership" ON miles_members 
    FOR SELECT USING (auth.uid() = user_id);

-- Miles ledger: Service role manages
CREATE POLICY "Service role can manage miles ledger" ON miles_ledger 
    FOR ALL USING (auth.role() = 'service_role');

-- Passengers: Users can view passengers of their bookings
CREATE POLICY "Users can view own passengers" ON passengers 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM bookings 
            WHERE bookings.id = passengers.booking_id 
            AND bookings.user_id = auth.uid()
        )
    );

-- Service role full access policies
CREATE POLICY "Service role manages miles_members" ON miles_members 
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages passengers" ON passengers 
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages processed_flight_miles" ON processed_flight_miles 
    FOR ALL USING (auth.role() = 'service_role');

-- Grant anonymous read on airports for non-authenticated searches
CREATE POLICY "Anon can read airports" ON airports 
    FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read flights" ON flights 
    FOR SELECT TO anon USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate member number
CREATE OR REPLACE FUNCTION generate_member_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
BEGIN
    SELECT 'MS' || LPAD(CAST(COALESCE(MAX(CAST(SUBSTRING(member_number FROM 3) AS INTEGER)), 0) + 1 AS VARCHAR), 8, '0')
    INTO new_number
    FROM miles_members;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate booking reference
CREATE OR REPLACE FUNCTION generate_booking_reference()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars VARCHAR := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_airports_updated_at BEFORE UPDATE ON airports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flights_updated_at BEFORE UPDATE ON flights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_miles_members_updated_at BEFORE UPDATE ON miles_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Schema created successfully! Tables: airports, flights, miles_members, miles_ledger, bookings, passengers, processed_flight_miles' AS status;
