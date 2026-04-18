// Given the interview transcript + reference labels, synthesize a taste profile via tool calling.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript, references } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const system = `You synthesize a designer's personal taste profile based on:
1) An interview transcript where they discussed their own work.
2) A list of references they labeled good / bad / best with their commentary.

Produce a profile in the designer's own register — confident, specific, never generic. Avoid platitudes ("clean and modern"). Quote specific things they said where it sharpens the description.`;

    const refsBlock = references.map((r: any, i: number) =>
      `Ref ${i + 1} [${r.label}]${r.commentary ? `: "${r.commentary}"` : ""}`
    ).join("\n");

    const transcriptBlock = transcript
      .map((m: any) => `${m.role === "user" ? "Designer" : "Interviewer"}: ${m.content}`)
      .join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `INTERVIEW TRANSCRIPT:\n${transcriptBlock}\n\nREFERENCES:\n${refsBlock}\n\nGenerate the taste profile.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_taste_profile",
            description: "Save the synthesized taste profile.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-4 sentence paragraph describing how this designer thinks. Specific, never generic." },
                values: { type: "array", items: { type: "string" }, description: "5-8 single-word or 2-word values they care about (e.g. 'whitespace', 'hierarchy', 'restraint', 'intention')." },
                avoid: { type: "array", items: { type: "string" }, description: "3-6 things they actively avoid, as short phrases." },
              },
              required: ["summary", "values", "avoid"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_taste_profile" } },
      }),
    });

    if (response.status === 429 || response.status === 402) {
      return new Response(JSON.stringify({ error: response.status === 429 ? "Rate limit reached." : "AI credits exhausted." }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Model did not return a tool call");
    const args = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("synthesize-profile error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
