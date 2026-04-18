// Generate work informed by the designer's taste profile.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief, format, profile, selectedRefs } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const formatInstructions: Record<string, string> = {
      "html": "Produce a single self-contained HTML file (with inline <style>) for a clean, well-considered mockup. Use system fonts. Do not include explanations in the HTML — the rationale goes in the rationale field.",
      "image_prompt": "Produce a single, vivid image-generation prompt (one paragraph, ~80-150 words) that another model could use to render the work. Be visually specific.",
      "brief": "Produce a creative brief (250-400 words) with sections: Concept, Direction, Tone, Key choices, Things to avoid.",
    };

    const refsBlock = (selectedRefs || []).map((r: any, i: number) =>
      `Ref ${i + 1} [${r.label}]${r.commentary ? `: "${r.commentary}"` : ""}`
    ).join("\n") || "(none selected — rely on the taste profile)";

    const system = `You are a senior designer making work for another designer whose taste profile is below. Match their values exactly. Avoid what they avoid. Their voice matters more than convention.

TASTE PROFILE
Summary: ${profile.summary}
Values: ${(profile.values || []).join(", ")}
Avoids: ${(profile.avoid || []).join(", ")}

REFERENCES THEY CHOSE FOR THIS PIECE:
${refsBlock}

OUTPUT FORMAT INSTRUCTIONS:
${formatInstructions[format] || formatInstructions["brief"]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `BRIEF: ${brief}\n\nGenerate the output now.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "deliver_work",
            description: "Return the generated output and a short rationale.",
            parameters: {
              type: "object",
              properties: {
                result: { type: "string", description: "The generated work in the requested format." },
                rationale: { type: "string", description: "2-4 sentences. Speak as the designer: 'I leaned into X because you value Y. I avoided Z.'" },
              },
              required: ["result", "rationale"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "deliver_work" } },
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
    console.error("generate-output error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
