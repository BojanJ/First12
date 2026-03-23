import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Minimal VAPID / Web Push implementation (no external dependency needed).
// Deno has native SubtleCrypto support so we can sign the JWT ourselves.
// ---------------------------------------------------------------------------

/** Convert a URL-safe base64 string to a Uint8Array. */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Encode a Uint8Array to URL-safe base64 (no padding). */
function uint8ArrayToBase64Url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Build a VAPID JWT and send a Web Push notification. */
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPrivateKeyBase64Url: string,
  vapidPublicKeyBase64Url: string,
  vapidSubject: string,
): Promise<{ ok: boolean; status?: number; body?: string }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // --- Build VAPID JWT ---
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 12 * 3600, sub: vapidSubject };

  const encHeader = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const encClaims = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  const signingInput = `${encHeader}.${encClaims}`;

  // Import the private key (PKCS8 / EC P-256)
  const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKeyBase64Url);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;

  // --- Encrypt the payload using Web Push / ECDH P-256 ---
  // (RFC 8291 "Message Encryption for Web Push")
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    base64UrlToUint8Array(subscription.keys.p256dh),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Generate an ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  // Derive the shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    serverKeyPair.privateKey,
    256,
  );

  const authSecret = base64UrlToUint8Array(subscription.keys.auth);

  // HKDF extract + expand (RFC 5869) helpers
  async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<CryptoKey> {
    const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prk = await crypto.subtle.sign("HMAC", saltKey, ikm);
    return crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }

  async function hkdfExpand(prk: CryptoKey, info: Uint8Array, length: number): Promise<Uint8Array> {
    const t = new Uint8Array(await crypto.subtle.sign("HMAC", prk, new Uint8Array([...info, 1])));
    return t.slice(0, length);
  }

  // Build PRK_key
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const prkKey = await hkdfExtract(authSecret, new Uint8Array(sharedSecret));
  const ikm = await hkdfExpand(prkKey, authInfo, 32);

  // Build PRK
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfoInput = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: aesgcm\0P-256\0"),
    0, 65,
    ...serverPublicKeyRaw,
    0, 65,
    ...base64UrlToUint8Array(subscription.keys.p256dh),
  ]);
  const nonceInfoInput = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: nonce\0P-256\0"),
    0, 65,
    ...serverPublicKeyRaw,
    0, 65,
    ...base64UrlToUint8Array(subscription.keys.p256dh),
  ]);

  const ikmKey = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);

  const contentEncKey = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: keyInfoInput }, ikmKey, 128),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: nonceInfoInput }, ikmKey, 96),
  );

  // Pad the payload (RFC 8291 §4)
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(payload);
  const padded = new Uint8Array(2 + plaintext.length);
  padded.set(plaintext, 2); // 2-byte padding length prefix (0)

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, contentEncKey, padded),
  );

  // Build the request
  const body = new Uint8Array([...salt, 0, 0, 16, 0, 65, ...serverPublicKeyRaw, ...ciphertext]);

  const vapidHeader = `vapid t=${jwt},k=${vapidPublicKeyBase64Url}`;

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      Encryption: `salt=${uint8ArrayToBase64Url(salt)}`,
      "Crypto-Key": `dh=${uint8ArrayToBase64Url(serverPublicKeyRaw)}`,
      TTL: "86400",
    },
    body,
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

// ---------------------------------------------------------------------------
// Edge Function entry point
// ---------------------------------------------------------------------------
serve(async (req) => {
  const payload = await req.json() as {
    event_id?: string;
    type?: string;
    user_id?: string;
  };
  const { event_id, type, user_id } = payload;

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  // ── Authenticate the caller ────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "");
  let callerId: string | null = null;

  if (jwt) {
    // Use a client scoped to the caller's JWT to verify identity
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: { user } } = await callerClient.auth.getUser();
    callerId = user?.id ?? null;
  }

  // ── Test notification (single user) ────────────────────────────────────────
  if (type === "test" && user_id) {
    // Only allow a user to test their own subscription
    if (!callerId || callerId !== user_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("push_token, nickname")
      .eq("id", user_id)
      .single();

    if (!profile?.push_token) {
      return new Response(JSON.stringify({ error: "No push subscription found" }), { status: 404 });
    }

    if (vapidPrivateKey && vapidPublicKey) {
      try {
        const sub = JSON.parse(profile.push_token);
        const notifPayload = JSON.stringify({
          title: "Soccer Scheduler",
          body: `Test notification for ${profile.nickname} ✅`,
          url: "/",
        });
        await sendWebPush(sub, notifPayload, vapidPrivateKey, vapidPublicKey, vapidSubject);
      } catch (e) {
        console.error("Test push failed:", e);
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Event notification (all subscribed users) ───────────────────────────────
  if (!event_id) {
    return new Response(JSON.stringify({ error: "event_id required" }), { status: 400 });
  }

  const { data: event } = await supabaseClient
    .from("events")
    .select("*")
    .eq("id", event_id)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found" }), { status: 404 });
  }

  // Filter users by the relevant notification preference column
  const prefColumn = type === "registration_open" ? "notify_on_opened" : "notify_on_created";

  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("push_token, nickname")
    .eq("notifications_enabled", true)
    .eq(prefColumn, true)
    .not("push_token", "is", null);

  const notifTitle = "Soccer Scheduler";
  const notifBody = type === "registration_open"
    ? `Registration is now open for ${event.title}!`
    : `New event: ${event.title} on ${new Date(event.starts_at).toLocaleDateString()}`;

  const eventUrl = `/events/${event_id}`;

  let notified = 0;
  const pushResults = await Promise.allSettled(
    (profiles ?? []).map(async (profile) => {
      if (!profile.push_token) return;
      try {
        const sub = JSON.parse(profile.push_token);
        const notifPayload = JSON.stringify({ title: notifTitle, body: notifBody, url: eventUrl });

        if (vapidPrivateKey && vapidPublicKey) {
          const result = await sendWebPush(sub, notifPayload, vapidPrivateKey, vapidPublicKey, vapidSubject);
          if (!result.ok) {
            console.error(`Push to ${profile.nickname} failed (${result.status}): ${result.body}`);
          } else {
            notified++;
          }
        } else {
          // VAPID keys not configured — log for debugging
          console.log(`[no-vapid] Would push to ${profile.nickname}:`, notifBody);
          notified++;
        }
      } catch (e) {
        console.error(`Push error for ${profile.nickname}:`, e);
      }
    }),
  );

  console.log("Push results:", pushResults.length, "attempted,", notified, "succeeded");

  return new Response(
    JSON.stringify({ success: true, notified }),
    { headers: { "Content-Type": "application/json" } },
  );
});
