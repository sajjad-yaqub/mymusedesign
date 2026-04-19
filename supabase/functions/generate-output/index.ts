// Generate work informed by the designer's taste profile.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIMENSION_TO_ASPECT: Record<string, string> = {
  "1024x1024": "square (1:1)",
  "1536x1024": "landscape (3:2)",
  "1024x1536": "portrait (2:3)",
  "1792x1024": "wide landscape (16:9)",
  "1024x1792": "tall portrait (9:16)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      brief,
      format,
      profile,
      selectedRefs,
      link,
      inspirationImages, // array of data URLs (ad-hoc, not saved)
      imageDimensions,   // e.g. "1024x1024"
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const refsBlock = (selectedRefs || []).map((r: any, i: number) =>
      `Ref ${i + 1} [${r.label}]${r.commentary ? `: "${r.commentary}"` : ""}`
    ).join("\n") || "(none selected from saved references)";

    const linkBlock = link ? `\nRELATED LINK (use as context — website / social): ${link}` : "";
    const inspirationCount = Array.isArray(inspirationImages) ? inspirationImages.length : 0;
    const inspirationBlock = inspirationCount > 0
      ? `\nThe designer also attached ${inspirationCount} ad-hoc inspiration image(s) for THIS piece only. Treat them as direct visual cues.`
      : "";

    // ===== IMAGE FORMAT: two-step (rationale + prompt → image) =====
    if (format === "image") {
      const aspect = DIMENSION_TO_ASPECT[imageDimensions] ?? "square (1:1)";

      // Step 1: build the image prompt using vision input from inspirations
      const planUserContent: any[] = [
        { type: "text", text: `BRIEF: ${brief}${linkBlock}\n\nTarget aspect: ${aspect}.` },
      ];
      if (Array.isArray(inspirationImages)) {
        for (const url of inspirationImages) {
          planUserContent.push({ type: "image_url", image_url: { url } });
        }
      }

      const planRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a senior designer making work for another designer. Their taste profile:
Summary: ${profile.summary}
Values: ${(profile.values || []).join(", ")}
Avoids: ${(profile.avoid || []).join(", ")}

Saved references they chose:
${refsBlock}${inspirationBlock}

Write a vivid image-generation prompt (one paragraph, 80-150 words) that reflects their taste exactly. Be visually specific: composition, palette, type, mood, materials. Mention the target aspect ratio.`,
            },
            { role: "user", content: planUserContent },
          ],
          tools: [{
            type: "function",
            function: {
              name: "deliver_image_plan",
              description: "Return the image prompt and a short rationale.",
              parameters: {
                type: "object",
                properties: {
                  image_prompt: { type: "string" },
                  rationale: { type: "string", description: "2-4 sentences in the designer's voice." },
                },
                required: ["image_prompt", "rationale"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "deliver_image_plan" } },
        }),
      });

      if (planRes.status === 429 || planRes.status === 402) {
        return new Response(JSON.stringify({ error: planRes.status === 429 ? "Rate limit reached." : "AI credits exhausted." }), {
          status: planRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!planRes.ok) {
        console.error("plan error:", planRes.status, await planRes.text());
        throw new Error("AI gateway error (plan)");
      }
      const planData = await planRes.json();
      const planCall = planData.choices?.[0]?.message?.tool_calls?.[0];
      if (!planCall) throw new Error("No image plan returned");
      const { image_prompt, rationale } = JSON.parse(planCall.function.arguments);

      // Step 2: generate the image (include inspiration images so the model can riff visually)
      const imgUserContent: any[] = [
        { type: "text", text: `${image_prompt}\n\nAspect ratio: ${aspect}.` },
      ];
      if (Array.isArray(inspirationImages)) {
        for (const url of inspirationImages) {
          imgUserContent.push({ type: "image_url", image_url: { url } });
        }
      }

      const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imgUserContent }],
          modalities: ["image", "text"],
        }),
      });

      if (imgRes.status === 429 || imgRes.status === 402) {
        return new Response(JSON.stringify({ error: imgRes.status === 429 ? "Rate limit reached." : "AI credits exhausted." }), {
          status: imgRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!imgRes.ok) {
        console.error("image error:", imgRes.status, await imgRes.text());
        throw new Error("AI gateway error (image)");
      }
      const imgData = await imgRes.json();
      const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) throw new Error("Model did not return an image");

      return new Response(JSON.stringify({ result: imageUrl, rationale, image_prompt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== TEXT FORMATS =====
    const formatInstructions: Record<string, string> = {
      "html": "Produce a single self-contained HTML file (with inline <style>) for a clean, well-considered mockup. Use system fonts. Return ONLY the HTML, starting with <!DOCTYPE html>. No markdown fences, no commentary.",
      "image_prompt": "Produce a single, vivid image-generation prompt (one paragraph, ~80-150 words) that another model could use to render the work. Be visually specific.",
      "brief": "Produce a creative brief (250-400 words) with sections: Concept, Direction, Tone, Key choices, Things to avoid.",
    };

    const system = `You are a senior designer making work for another designer whose taste profile is below. Match their values exactly. Avoid what they avoid. Their voice matters more than convention.

TASTE PROFILE
Summary: ${profile.summary}
Values: ${(profile.values || []).join(", ")}
Avoids: ${(profile.avoid || []).join(", ")}

SAVED REFERENCES THEY CHOSE FOR THIS PIECE:
${refsBlock}${linkBlock}${inspirationBlock}

OUTPUT FORMAT INSTRUCTIONS:
${formatInstructions[format] || formatInstructions["brief"]}`;

    // Build user content with inspiration images for vision
    const userContent: any[] = [
      { type: "text", text: `BRIEF: ${brief}\n\nGenerate the output now.` },
    ];
    if (Array.isArray(inspirationImages)) {
      for (const url of inspirationImages) {
        userContent.push({ type: "image_url", image_url: { url } });
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
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
