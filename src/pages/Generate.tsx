import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { useReferences, useReferenceUrls } from "@/hooks/useReferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Copy, RefreshCw } from "lucide-react";
import { LabelChip } from "@/components/LabelChip";
import { Navigate } from "react-router-dom";

const FORMATS = [
  { id: "html", label: "HTML/CSS mockup" },
  { id: "image_prompt", label: "Image generation prompt" },
  { id: "brief", label: "Creative brief" },
];

export default function GeneratePage() {
  const { user } = useAuth();
  const { profile, loading } = useTasteProfile();
  const { refs } = useReferences(user?.id);
  const urls = useReferenceUrls(refs);

  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("brief");
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<{ result: string; rationale: string } | null>(null);

  if (loading) return null;
  if (!profile) return <Navigate to="/interview" replace />;

  const toggleRef = (id: string) => {
    setSelectedRefIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const generate = async () => {
    if (!brief.trim()) {
      toast.error("Tell me what you're making.");
      return;
    }
    setBusy(true);
    try {
      const selectedRefs = refs
        .filter((r) => selectedRefIds.has(r.id))
        .map((r) => ({ label: r.label, commentary: r.commentary }));

      const { data, error } = await supabase.functions.invoke("generate-output", {
        body: { brief, format, profile, selectedRefs },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOutput({ result: data.result, rationale: data.rationale });

      await supabase.from("generations").insert({
        user_id: user!.id,
        brief,
        reference_ids: Array.from(selectedRefIds),
        output_format: format,
        result: data.result,
        rationale: data.rationale,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-12 py-16 max-w-3xl">
      <div className="text-eyebrow mb-4">Generate</div>
      <h1 className="font-serif text-5xl text-ink mb-12 leading-tight">Make something.</h1>

      <div className="space-y-10">
        <div>
          <label className="text-eyebrow block mb-3">What are you making?</label>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. A landing page for a fintech app aimed at freelancers."
            className="bg-transparent border-border text-[15px] resize-none focus-visible:ring-0 focus-visible:border-ink/40"
          />
        </div>

        <div>
          <label className="text-eyebrow block mb-3">Pick references to draw from</label>
          {refs.length === 0 ? (
            <p className="text-sm text-ink-faint">No references uploaded.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {refs.map((r) => {
                const sel = selectedRefIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRef(r.id)}
                    className={`group relative aspect-[4/3] rounded overflow-hidden border transition ${
                      sel ? "border-ink ring-1 ring-ink/40" : "border-border hover:border-ink/40"
                    }`}
                  >
                    {urls[r.id] && <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />}
                    <div className="absolute bottom-1.5 left-1.5">
                      <LabelChip kind={r.label} active={sel} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="text-eyebrow block mb-3">Output format</label>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`text-sm px-4 py-2 rounded-full border transition ${
                  format === f.id ? "border-ink text-ink bg-secondary/40" : "border-border text-muted-foreground hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={generate} disabled={busy} className="h-11 px-6">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : "Generate"}
          </Button>
        </div>
      </div>

      {output && (
        <div className="mt-16 pt-12 border-t border-border space-y-8 animate-fade-in">
          <div>
            <div className="text-eyebrow mb-3">Result</div>
            <pre className="whitespace-pre-wrap text-[14px] text-ink leading-relaxed font-sans bg-card border border-border rounded p-6 max-h-[600px] overflow-auto">
              {output.result}
            </pre>
          </div>
          <div>
            <div className="text-eyebrow mb-3">Why I made these choices</div>
            <p className="font-serif text-xl text-ink leading-snug">{output.rationale}</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={generate} variant="outline" disabled={busy}>
              <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
            </Button>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(output.result); toast.success("Copied."); }}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
