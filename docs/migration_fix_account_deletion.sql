-- Run this script in your Supabase SQL Editor to fix the account deletion issue

-- 1. Drop existing foreign key constraints
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_miles_member_id_fkey;
ALTER TABLE miles_ledger DROP CONSTRAINT IF EXISTS miles_ledger_member_id_fkey;

-- 2. Re-add constraints with appropriate ON DELETE behavior
-- For bookings: Set miles_member_id to NULL when member is deleted (preserve booking)
ALTER TABLE bookings 
ADD CONSTRAINT bookings_miles_member_id_fkey 
FOREIGN KEY (miles_member_id) 
REFERENCES miles_members(id) 
ON DELETE SET NULL;

-- For miles_ledger: Delete ledger entries when member is deleted (cleanup)
ALTER TABLE miles_ledger 
ADD CONSTRAINT miles_ledger_member_id_fkey 
FOREIGN KEY (member_id) 
REFERENCES miles_members(id) 
ON DELETE CASCADE;

-- 3. Verify
SELECT 'Successfully updated foreign key constraints for account deletion' as status;
