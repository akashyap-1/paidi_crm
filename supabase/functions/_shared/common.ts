import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Service-role client: bypasses RLS. Never return its results unfiltered. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Member {
  id: string;
  email: string;
  role: "admin" | "editor";
  display_name: string;
}

/** Resolves the caller's JWT to an allowlisted team member, or null. */
export async function memberFromRequest(db: SupabaseClient, req: Request): Promise<Member | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: member } = await db
    .from("allowed_users")
    .select("id, email, role, display_name")
    .eq("email", email)
    .maybeSingle();
  return (member as Member | null) ?? null;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// --- Refresh-token encryption at rest (AES-256-GCM) -------------------------

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out);
}

async function tokenKey(): Promise<CryptoKey> {
  const raw = b64decode(env("TOKEN_ENCRYPTION_KEY"));
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tokenKey(),
    new TextEncoder().encode(plain),
  );
  return `${b64encode(iv)}.${b64encode(new Uint8Array(cipher))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [iv, cipher] = stored.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(iv) },
    await tokenKey(),
    b64decode(cipher),
  );
  return new TextDecoder().decode(plain);
}

// --- Google OAuth ------------------------------------------------------------

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function oauthRedirectUri(): string {
  return `${env("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`;
}

export async function googleToken(params: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  scope?: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Google token error: ${body.error ?? res.status} ${body.error_description ?? ""}`);
  }
  return body;
}

export async function gmailGet<T>(accessToken: string, path: string, query?: URLSearchParams): Promise<T> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail ${path} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}
