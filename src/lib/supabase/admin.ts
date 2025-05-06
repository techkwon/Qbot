import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// Note: supabaseAdmin uses the SERVICE_ROLE_KEY which you must only use in a secure server environment
// Never expose your service role key in the browser

export const createAdminClient = () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
    }

    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                // autoRefreshToken: false, // Consider disabling if not needed for service role
                // persistSession: false // Typically false for service roles
            }
        }
    );
};
