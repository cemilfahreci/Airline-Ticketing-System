const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL is not configured!');
    console.error('   Please set SUPABASE_URL in your .env file');
}

if (!supabaseAnonKey) {
    console.error('❌ SUPABASE_ANON_KEY is not configured!');
    console.error('   Please set SUPABASE_ANON_KEY in your .env file');
}

// Client for public operations (respects RLS)
let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: false
        },
        global: {
            fetch: (url, options = {}) => {
                return fetch(url, {
                    ...options,
                    signal: AbortSignal.timeout(10000) // 10 second timeout for all requests
                });
            }
        }
    });
}

// Admin client for service operations (bypasses RLS)
let supabaseAdmin = null;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        },
        global: {
            fetch: (url, options = {}) => {
                return fetch(url, {
                    ...options,
                    signal: AbortSignal.timeout(10000) // 10 second timeout for all requests
                });
            }
        }
    });
}

module.exports = { supabase, supabaseAdmin };
