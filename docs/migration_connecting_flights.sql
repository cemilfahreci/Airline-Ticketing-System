-- ============================================
-- Migration: Add connecting flights support
-- Run this in Supabase SQL Editor
-- ============================================

-- Add flight_segments column to bookings table (JSONB array of flight IDs)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS flight_segments JSONB;

-- Add comment
COMMENT ON COLUMN bookings.flight_segments IS 'Array of flight IDs for connecting flights. Null for direct flights.';

-- Create index for JSONB queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_bookings_flight_segments ON bookings USING GIN (flight_segments);

-- Update existing bookings to have flight_segments as null (they are all direct flights)
UPDATE bookings SET flight_segments = NULL WHERE flight_segments IS NULL;

SELECT 'Migration completed: flight_segments column added to bookings table' AS status;
