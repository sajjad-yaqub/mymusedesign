// Generate work informed by the designer's taste profile.
// All three formats (landing, app, image) output a rendered IMAGE.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIMENSION_TO_ASPECT: Record<string, string> = {
  "1024x1024": "square (1:1)",
  "1024x1280": "portrait (4:5)",
  "1024x1820": "vertical story (9:16)",
  "1820x1024": "wide landscape (16:9)",
};

// Detect Devanagari (Hindi) presence in the brief
const hasHindi = (s: string) => /[\u0900-\u097F]/.test(s ?? "");

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

    const {
      brief,
      format,                // "landing" | "app" | "image"
      profile,               // { summary, values, avoid }
      allReferences,         // array of { label, commentary } — ALL refs, auto-pulled
      link,
      inspirationImages,     // data URLs
      imageDimensions,       // only for "image" format
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const refsBlock = (allReferences || []).map((r: any, i: number) =>
      `Ref ${i + 1} [${r.label}]${r.commentary ? `: "${r.commentary}"` : ""}`
    ).join("\n") || "(no saved references)";

    // ===== Scrape link for vibe / palette / logo =====
    let linkContext = "";
    if (link) {
      try {
        const u = new URL(link.startsWith("http") ? link : `https://${link}`);
        const origin = u.origin;
        const pageRes = await fetch(u.toString(), {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MyMuseBot/1.0)" },
          signal: AbortSignal.timeout(8000),
        });
        const html = (await pageRes.text()).slice(0, 200_000);

        const pick = (re: RegExp) => (html.match(re)?.[1] ?? "").trim();
        const title = pick(/<title[^>]*>([^<]+)<\/title>/i);
        const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
          || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
        const favicon = pick(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i);

        const hexColors = Array.from(html.matchAll(/#([0-9a-fA-F]{6})\b/g)).map((m) => `#${m[1].toLowerCase()}`);
        const colorCounts: Record<string, number> = {};
        for (const c of hexColors) colorCounts[c] = (colorCounts[c] || 0) + 1;
        const topColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1500);

        const absolutize = (src: string) => {
          if (!src) return "";
          if (src.startsWith("//")) return "https:" + src;
          if (src.startsWith("http")) return src;
          if (src.startsWith("/")) return origin + src;
          return origin + "/" + src;
        };

        linkContext = `
RELATED LINK: ${link}
- Title: ${title || "(unknown)"}
- Description: ${desc || "(none)"}
- Logo: ${absolutize(favicon) || "(none)"}
- OG image: ${absolutize(ogImage) || "(none)"}
- Theme color: ${themeColor || "(none)"}
- Top hex colors: ${topColors.join(", ") || "(none)"}
- Copy excerpt: "${text}"

Mirror this brand's vibe — palette, tone, logo. If embedding a logo in the design, use the absolute URL above.`;
      } catch (e) {
        console.warn("link scrape failed:", e);
        linkContext = `\nRELATED LINK (couldn't fetch, treat URL as a hint): ${link}`;
      }
    }

    const inspirationCount = Array.isArray(inspirationImages) ? inspirationImages.length : 0;
    const inspirationBlock = inspirationCount > 0
      ? `\n${inspirationCount} inspiration image(s) attached for THIS piece. Treat as direct visual cues.`
      : "";

    // Hindi flag
    const hindiInBrief = hasHindi(brief);
    const langInstruction = hindiInBrief
      ? `\n\nLANGUAGE: The brief contains Hindi (Devanagari). Any text rendered in the image MUST use correct Hindi grammar, spelling, and Devanagari script. Mix English only if the brief mixes them. Render Devanagari letters precisely — no garbled glyphs.`
      : `\n\nLANGUAGE: Use clean, grammatically correct English for any text rendered in the image. Short, skim-readable copy.`;

    // ===== Step 1: build image prompt =====
    const aspect = format === "image"
      ? (DIMENSION_TO_ASPECT[imageDimensions] ?? "square (1:1)")
      : format === "landing"
      ? "wide landscape (16:9)"
      : "portrait (9:19.5) — mobile app screen";

    const formatGuide: Record<string, string> = {
      landing: `Render a polished LANDING PAGE design as a single image — hero section visible at top with headline, subhead, primary CTA, and a representative visual; followed by one or two supporting sections (features / social proof). Treat it like a high-fidelity Figma mockup screenshot. Real, readable typography. Real product-like visuals.`,
      app: `Render a polished MOBILE APP UI screen as a single image — phone-frame optional, but the screen content (status bar, header, primary content, bottom nav if relevant) should look production-ready. Real readable typography, real iconography, real micro-copy.`,
      image: `Render a single visual artwork (poster / illustration / composition / photo-style image) — whatever best fits the brief. No UI chrome unless asked.`,
    };

    const planRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a senior designer shaping a vivid image-generation prompt for another designer.

THEIR TASTE
Summary: ${profile?.summary ?? "(none)"}
Values: ${(profile?.values || []).join(", ") || "(none)"}
Avoids: ${(profile?.avoid || []).join(", ") || "(none)"}

THEIR REFERENCES (full library — pull from these silently)
${refsBlock}${linkContext}${inspirationBlock}

OUTPUT TYPE: ${format}
${formatGuide[format] || formatGuide.image}
Target aspect: ${aspect}.${langInstruction}

Write ONE vivid image-generation prompt (90–160 words). Be specific: composition, palette (hex if from link), typography, real copy strings to render, mood, materials. If type is "landing" or "app", spell out exact text content for headline, CTA, labels — short and skim-readable.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `BRIEF: ${brief}\n\nWrite the image prompt now.` },
              ...(Array.isArray(inspirationImages) ? inspirationImages.map((url: string) => ({ type: "image_url", image_url: { url } })) : []),
            ],
          },
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
                rationale: { type: "string", description: "2–3 short lines in the designer's voice." },
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

    // ===== Step 2: render image =====
    const imgUserContent: any[] = [
      { type: "text", text: `${image_prompt}\n\nAspect ratio: ${aspect}.${hindiInBrief ? " Render Hindi text in correct Devanagari script with proper grammar." : ""}` },
    ];
    if (Array.isArray(inspirationImages)) {
      for (const url of inspirationImages) imgUserContent.push({ type: "image_url", image_url: { url } });
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
  } catch (e) {
    console.error("generate-output error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
