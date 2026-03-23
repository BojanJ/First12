import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { event_id, type } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch event
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", event_id)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found" }), { status: 404 });
  }

  // Fetch all profiles with push tokens
  const { data: profiles } = await supabase
    .from("profiles")
    .select("push_token, nickname")
    .not("push_token", "is", null);

  const message = type === "registration_open"
    ? `Registration is now open for ${event.title}!`
    : `New event: ${event.title} on ${new Date(event.starts_at).toLocaleDateString()}`;

  // Send web push notifications
  const pushPromises = (profiles ?? [])
    .filter((p) => p.push_token)
    .map(async (profile) => {
      try {
        // Push token is a JSON stringified PushSubscription object
        const subscription = JSON.parse(profile.push_token);
        // In production, use web-push library; here we log for MVP
        console.log(`Would push to ${profile.nickname}: ${message}`, subscription);
      } catch (e) {
        console.error("Push failed:", e);
      }
    });

  await Promise.all(pushPromises);

  // Send email via Resend (if RESEND_API_KEY is configured)
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (resendApiKey) {
    const { data: usersWithEmail } = await supabase.auth.admin.listUsers();
    const emailPromises = (usersWithEmail?.users ?? []).map(async (user) => {
      if (!user.email) return;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Soccer Scheduler <noreply@yourdomain.com>",
          to: user.email,
          subject: message,
          html: `<p>${message}</p><p>Location: ${event.location}</p>`,
        }),
      });
    });
    await Promise.all(emailPromises);
  }

  return new Response(JSON.stringify({ success: true, notified: profiles?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
