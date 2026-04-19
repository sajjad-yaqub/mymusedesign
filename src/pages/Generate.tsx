import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { useReferences, useReferenceUrls } from "@/hooks/useReferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Copy, RefreshCw, Download, Eye, Code2 } from "lucide-react";
import { LabelChip } from "@/components/LabelChip";
import { Link } from "react-router-dom";

const FORMATS = [
  { id: "html", label: "HTML/CSS mockup" },
  { id: "image", label: "Image" },
  { id: "image_prompt", label: "Image prompt" },
  { id: "brief", label: "Creative brief" },
];

type Output = { result: string; rationale: string; image_prompt?: string };

export default function GeneratePage() {
  const { user } = useAuth();
  const { profile, loading } = useTasteProfile();
  const { refs } = useReferences(user?.id);
  const urls = useReferenceUrls(refs);

  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("brief");
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);
  const [outputFormat, setOutputFormat] = useState<string>("brief");
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview");

  if (loading) return null;

  if (!profile) {
    return (
      <div className="px-12 py-16 max-w-2xl">
        <div className="text-eyebrow mb-4">Generate</div>
        <h1 className="font-serif text-5xl text-ink mb-6 leading-tight">No taste profile yet.</h1>
        <p className="text-ink-faint text-[15px] leading-relaxed mb-8">
          Generation works best once I know how you see design. Run the interview to build your taste profile, then come back here.
        </p>
        <Link
          to="/interview"
          className="inline-flex items-center h-11 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
        >
          Start the interview
        </Link>
      </div>
    );
  }

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

      setOutput({ result: data.result, rationale: data.rationale, image_prompt: data.image_prompt });
      setOutputFormat(format);
      setHtmlView("preview");

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

  const copy = () => {
    navigator.clipboard.writeText(output!.result);
    toast.success("Copied.");
  };

  const downloadImage = () => {
    if (!output) return;
    const a = document.createElement("a");
    a.href = output.result;
    a.download = `my-muse-${Date.now()}.png`;
    a.click();
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
            <div className="flex items-center justify-between mb-3">
              <div className="text-eyebrow">Result</div>
              {outputFormat === "html" && (
                <div className="flex gap-1 border border-border rounded-full p-0.5">
                  <button
                    onClick={() => setHtmlView("preview")}
                    className={`text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition ${
                      htmlView === "preview" ? "bg-secondary/60 text-ink" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  <button
                    onClick={() => setHtmlView("code")}
                    className={`text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition ${
                      htmlView === "code" ? "bg-secondary/60 text-ink" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    <Code2 className="w-3 h-3" /> Code
                  </button>
                </div>
              )}
            </div>

            {outputFormat === "image" ? (
              <div className="bg-card border border-border rounded p-4">
                <img
                  src={output.result}
                  alt={output.image_prompt ?? "Generated"}
                  className="w-full h-auto rounded"
                />
              </div>
            ) : outputFormat === "html" && htmlView === "preview" ? (
              <iframe
                title="Preview"
                srcDoc={output.result}
                sandbox="allow-same-origin"
                className="w-full h-[600px] bg-white border border-border rounded"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-[14px] text-ink leading-relaxed font-sans bg-card border border-border rounded p-6 max-h-[600px] overflow-auto">
                {output.result}
              </pre>
            )}
          </div>

          <div>
            <div className="text-eyebrow mb-3">Why I made these choices</div>
            <p className="font-serif text-xl text-ink leading-snug">{output.rationale}</p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button onClick={generate} variant="outline" disabled={busy}>
              <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
            </Button>
            {outputFormat === "image" ? (
              <Button variant="outline" onClick={downloadImage}>
                <Download className="w-4 h-4 mr-2" /> Download
              </Button>
            ) : (
              <Button variant="outline" onClick={copy}>
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
