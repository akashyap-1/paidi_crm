// Google redirects here after consent. Exchanges the code, encrypts the
// refresh token, stores it server side, then sends the browser back to the app.
import {
  adminClient, encryptToken, env, gmailGet, GMAIL_SCOPE, googleToken, oauthRedirectUri,
} from "../_shared/common.ts";

function back(result: string): Response {
  const app = env("APP_URL").replace(/\/$/, "");
  return Response.redirect(`${app}/#/settings?gmail=${encodeURIComponent(result)}`, 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back("cancelled");

  try {
    const db = adminClient();

    // One-time state: consumed here, valid for 10 minutes, must belong to an admin.
    const { data: memberId } = await db.rpc("oauth_state_consume", { p_state: state });
    if (!memberId) return back("expired");
    const { data: member } = await db
      .from("allowed_users").select("id, role").eq("id", memberId).maybeSingle();
    if (!member || member.role !== "admin") return back("forbidden");

    const tokens = await googleToken({
      code,
      grant_type: "authorization_code",
      redirect_uri: oauthRedirectUri(),
    });
    if (!tokens.refresh_token) return back("no_refresh_token");
    if (tokens.scope && !tokens.scope.split(" ").includes(GMAIL_SCOPE)) return back("scope_denied");

    const profile = await gmailGet<{ emailAddress: string }>(tokens.access_token, "profile");
    const email = profile.emailAddress.toLowerCase();

    const { data: account, error } = await db
      .from("gmail_accounts")
      .upsert({
        team_member_id: member.id,
        email,
        status: "active",
        last_error: null,
        connected_at: new Date().toISOString(),
        sync_after: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "email" })
      .select("id")
      .single();
    if (error) throw error;

    const { error: tokErr } = await db.rpc("gmail_token_set", {
      p_account: account.id,
      p_token_enc: await encryptToken(tokens.refresh_token),
    });
    if (tokErr) throw tokErr;

    return back("connected");
  } catch (e) {
    console.error(e);
    return back("error");
  }
});
