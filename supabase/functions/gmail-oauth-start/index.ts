// Starts the Google OAuth flow for an admin connecting their own inbox.
// Returns the Google consent URL; the browser navigates to it.
import {
  adminClient, corsHeaders, env, GMAIL_SCOPE, json, memberFromRequest, oauthRedirectUri,
} from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = adminClient();
    const member = await memberFromRequest(db, req);
    if (!member || member.role !== "admin") return json({ error: "Admins only" }, 403);

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await db.rpc("oauth_state_create", { p_state: state, p_member: member.id });
    if (error) throw error;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: oauthRedirectUri(),
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    }).toString();
    return json({ url: url.toString() });
  } catch (e) {
    console.error(e);
    return json({ error: "Could not start the Google sign-in." }, 500);
  }
});
