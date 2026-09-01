import { createClient } from "@supabase/supabase-js";

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createAdminClient() {
  return createClient(
    requireValue("NEXT_PUBLIC_SUPABASE_URL"),
    requireValue("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
