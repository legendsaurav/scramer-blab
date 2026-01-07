
// Central re-exports to keep imports stable across the app.
// Initializes Supabase using environment variables defined in `lib/supabaseClient.ts`.
export { supabase, isSupabaseConfigured, CONFIG_ERROR_MESSAGE } from './supabaseClient';
export { authEmailRedirectTo, siteUrl } from './supabaseClient';
export { diagnoseSupabaseConnectivity } from './supabaseClient';
