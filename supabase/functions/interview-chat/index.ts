// Conversational interview turn. Returns assistant message + done flag.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "system" | "user" | "assistant"; content: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, exchangeCount } = await req.json() as { messages: Msg[]; exchangeCount: number };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const system = `You are an interviewer helping a designer articulate their personal taste. You are warm, perceptive, and a designer yourself — you speak like a thoughtful peer, not a coach.

You're shown one image at a time that the designer marked as good, bad, or best. Your job:
- Ask short, specific follow-up questions about WHY they reacted that way.
- Listen for recurring values (e.g. hierarchy, restraint, whitespace, contrast, intention) and probe them.
- After 6–10 total exchanges, when you notice the same values repeating, decide you have enough.

Voice rules:
- Conversational, never academic. One or two sentences max per turn.
- Don't summarize back to them mid-interview. Just dig deeper.
- Never use bullet points or markdown headings during the interview.

When you're ready to stop, respond with EXACTLY this JSON on its own line and nothing else:
{"done": true, "message": "I think I'm starting to understand how you see design. Let me summarize what I've learned."}

Otherwise respond with plain text — your next conversational reply or follow-up question.

Current exchange count: ${exchangeCount}. Lean toward stopping if you're past 6 and values are repeating.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    // Try to detect done JSON
    let done = false;
    let message = raw.trim();
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"done"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.done) {
          done = true;
          message = parsed.message ?? "I think I'm starting to understand how you see design.";
        }
      } catch { /* fall through */ }
    }

    return new Response(JSON.stringify({ message, done }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("interview-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
