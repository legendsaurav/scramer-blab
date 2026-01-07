import { createClient } from '@supabase/supabase-js';

export const sanitizeUrl = (value?: string) => (value ? value.trim().replace(/\/$/, '') : undefined);
export const sanitizeKey = (value?: string) => value?.trim();

const supabaseUrl = sanitizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseAnonKey = sanitizeKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

const defaultSiteUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
export const siteUrl = sanitizeUrl(import.meta.env.VITE_SITE_URL as string | undefined) || defaultSiteUrl;
// Redirect URL for Supabase auth emails: default to siteUrl
export const authEmailRedirectTo = `${siteUrl}/`;

export const CONFIG_ERROR_MESSAGE =
  'Supabase credentials are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables (Vercel → Settings → Environment Variables) and redeploy.';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = !!supabase;

// Lightweight connectivity diagnostics to help troubleshoot production issues
export const diagnoseSupabaseConnectivity = async () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[supabase] Missing URL or anon key. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
      return { ok: false, reason: 'missing-env' } as const;
    }
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: supabaseAnonKey,
      },
      method: 'GET',
    });
    if (!res.ok) {
      console.warn('[supabase] Auth settings fetch failed:', res.status, await res.text());
      return { ok: false, reason: 'http-error', status: res.status } as const;
    }
    return { ok: true } as const;
  } catch (e) {
    console.error('[supabase] Network error fetching auth settings. Possible mixed content (HTTPS→HTTP) or DNS/CORS issue.', e);
    return { ok: false, reason: 'network-error' } as const;
  }
};
