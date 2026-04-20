import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { useReferences, useReferenceUrls } from "@/hooks/useReferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Copy, RefreshCw, Download, Eye, Code2, Upload, X, BookmarkPlus, Save, Sparkles } from "lucide-react";
import { LabelChip, type LabelKind } from "@/components/LabelChip";
import { Link } from "react-router-dom";

const FORMATS = [
  { id: "html", label: "HTML/CSS mockup" },
  { id: "image", label: "Image" },
  { id: "image_prompt", label: "Image prompt" },
  { id: "brief", label: "Creative brief" },
];

const DIMENSIONS = [
  { id: "1024x1024", label: "Square 1:1" },
  { id: "1536x1024", label: "Landscape 3:2" },
  { id: "1024x1536", label: "Portrait 2:3" },
  { id: "1792x1024", label: "Wide 16:9" },
  { id: "1024x1792", label: "Tall 9:16" },
];

type Output = { id?: string; result: string; rationale: string; image_prompt?: string };

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function GeneratePage() {
  const { user } = useAuth();
  const { profile, loading } = useTasteProfile();
  const { refs, refetch: refetchRefs } = useReferences(user?.id);
  const urls = useReferenceUrls(refs);

  const [brief, setBrief] = useState("");
  const [link, setLink] = useState("");
  const [format, setFormat] = useState("brief");
  const [dimensions, setDimensions] = useState("1024x1024");
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());
  const [inspirations, setInspirations] = useState<{ id: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState<Output | null>(null);
  const [outputFormat, setOutputFormat] = useState<string>("brief");
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview");
  const [savingRef, setSavingRef] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [historySaved, setHistorySaved] = useState(false);
  const [refSaved, setRefSaved] = useState(false);

  // Estimated time per format (seconds). Image is two-step so longest.
  const ESTIMATE_S: Record<string, number> = { brief: 18, image_prompt: 15, html: 35, image: 50 };
  const estimate = ESTIMATE_S[format] ?? 25;

  // Tick a timer while generating
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(t);
  }, [busy]);

  const STEPS = format === "image"
    ? ["Reading your taste profile", "Studying your references", "Drafting the image prompt", "Rendering the image"]
    : format === "html"
    ? ["Reading your taste profile", "Studying your references", link ? "Pulling vibe from your link" : "Sketching the layout", "Wiring up the markup"]
    : ["Reading your taste profile", "Studying your references", "Shaping the direction", "Polishing the output"];
  const stepIdx = Math.min(STEPS.length - 1, Math.floor((elapsed / Math.max(estimate, 1)) * STEPS.length));
  const pct = Math.min(96, (elapsed / Math.max(estimate, 1)) * 100); // never hit 100 until done
  const remaining = Math.max(0, Math.ceil(estimate - elapsed));
  const overrun = elapsed > estimate;

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

  const onUploadInspiration = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 6);
    try {
      const uploaded = await Promise.all(
        arr.map(async (f) => ({ id: crypto.randomUUID(), dataUrl: await fileToDataUrl(f) }))
      );
      setInspirations((p) => [...p, ...uploaded].slice(0, 8));
    } catch {
      toast.error("Couldn't read those files.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeInspiration = (id: string) => {
    setInspirations((p) => p.filter((i) => i.id !== id));
  };

  const generate = async () => {
    if (!brief.trim()) {
      toast.error("Tell me what you're making.");
      return;
    }
    setBusy(true);
    setHistorySaved(false);
    setRefSaved(false);
    try {
      const selectedRefs = refs
        .filter((r) => selectedRefIds.has(r.id))
        .map((r) => ({ label: r.label, commentary: r.commentary }));

      const { data, error } = await supabase.functions.invoke("generate-output", {
        body: {
          brief,
          format,
          profile,
          selectedRefs,
          link: link.trim() || null,
          inspirationImages: inspirations.map((i) => i.dataUrl),
          imageDimensions: format === "image" ? dimensions : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save the generation row (not in history yet)
      const { data: inserted, error: insErr } = await supabase
        .from("generations")
        .insert({
          user_id: user!.id,
          brief,
          link: link.trim() || null,
          reference_ids: Array.from(selectedRefIds),
          inspirations: [], // ad-hoc data URLs are not persisted; only counted
          output_format: format,
          image_dimensions: format === "image" ? dimensions : null,
          result: data.result,
          rationale: data.rationale,
          saved_to_history: false,
        })
        .select("id")
        .single();
      if (insErr) console.error(insErr);

      setOutput({ id: inserted?.id, result: data.result, rationale: data.rationale, image_prompt: data.image_prompt });
      setOutputFormat(format);
      setHtmlView("preview");
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

  const dataUrlToBlob = async (dataUrl: string) => {
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const saveToReferences = async (rating: LabelKind) => {
    if (!output || outputFormat !== "image" || !user) return;
    setSavingRef(true);
    try {
      const blob = await dataUrlToBlob(output.result);
      const path = `${user.id}/generated-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from("references").upload(path, blob, {
        contentType: "image/png",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("references").insert({
        user_id: user.id,
        storage_path: path,
        label: rating,
        commentary: brief.slice(0, 200),
      });
      if (dbErr) throw dbErr;
      toast.success(`Saved to references as "${rating}".`);
      setRefSaved(true);
      refetchRefs();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save reference");
    } finally {
      setSavingRef(false);
    }
  };

  const saveToHistory = async (rating?: LabelKind) => {
    if (!output?.id) return;
    setSavingHistory(true);
    try {
      const { error } = await supabase
        .from("generations")
        .update({ saved_to_history: true, ...(rating ? { rating } : {}) })
        .eq("id", output.id);
      if (error) throw error;
      toast.success("Saved to history.");
      setHistorySaved(true);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save to history");
    } finally {
      setSavingHistory(false);
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
          <label className="text-eyebrow block mb-3">Website or social link <span className="text-ink-faint normal-case tracking-normal">(optional)</span></label>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yourbrand.com or https://instagram.com/handle"
            className="bg-transparent border-border text-[14px] focus-visible:ring-0 focus-visible:border-ink/40"
          />
        </div>

        <div>
          <div className="flex items-end justify-between mb-3">
            <label className="text-eyebrow">Inspirations for this piece <span className="text-ink-faint normal-case tracking-normal">(not saved)</span></label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-muted-foreground hover:text-ink inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onUploadInspiration(e.target.files)}
            />
          </div>
          {inspirations.length === 0 ? (
            <p className="text-sm text-ink-faint">Drop in screenshots or photos to steer this generation only.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {inspirations.map((i) => (
                <div key={i.id} className="relative aspect-[4/3] rounded overflow-hidden border border-border">
                  <img src={i.dataUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeInspiration(i.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-eyebrow block mb-3">Pick saved references to draw from</label>
          {refs.length === 0 ? (
            <p className="text-sm text-ink-faint">No references uploaded yet.</p>
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

        {format === "image" && (
          <div>
            <label className="text-eyebrow block mb-3">Image dimensions</label>
            <div className="flex flex-wrap gap-2">
              {DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDimensions(d.id)}
                  className={`text-sm px-4 py-2 rounded-full border transition ${
                    dimensions === d.id ? "border-ink text-ink bg-secondary/40" : "border-border text-muted-foreground hover:text-ink"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={generate} disabled={busy} className="h-11 px-6">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : "Generate"}
          </Button>
        </div>

        {busy && (
          <div className="mt-2 rounded-lg border border-border bg-card/40 p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="font-medium">{STEPS[stepIdx]}…</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {overrun ? `${Math.round(elapsed)}s — almost there` : `~${remaining}s left`}
              </div>
            </div>
            <Progress value={pct} className="h-1.5" />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1.5 transition ${
                    i < stepIdx ? "text-ink/70" : i === stepIdx ? "text-ink" : "opacity-50"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      i < stepIdx ? "bg-primary" : i === stepIdx ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                    }`}
                  />
                  {s}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-faint italic">Hang tight — good taste takes a moment.</p>
          </div>
        )}
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

          {outputFormat === "image" && (
            <div className="pt-4 border-t border-border">
              <div className="text-eyebrow mb-3">Save to references</div>
              <p className="text-sm text-ink-faint mb-4">Rate it and add it to your library so it shapes future work.</p>
              <div className="flex items-center gap-2">
                {(["good", "best", "bad"] as LabelKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => saveToReferences(k)}
                    disabled={savingRef || refSaved}
                    className="disabled:opacity-50"
                  >
                    <LabelChip kind={k} size="md" />
                  </button>
                ))}
                {refSaved && <span className="text-xs text-ink-faint ml-2">Saved.</span>}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <div className="text-eyebrow mb-3">Save to history</div>
            <p className="text-sm text-ink-faint mb-4">Rate this generation and keep it in your history.</p>
            <div className="flex items-center gap-2 flex-wrap">
              {(["good", "best", "bad"] as LabelKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => saveToHistory(k)}
                  disabled={savingHistory || historySaved}
                  className="disabled:opacity-50"
                >
                  <LabelChip kind={k} size="md" />
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveToHistory()}
                disabled={savingHistory || historySaved}
                className="ml-2"
              >
                {historySaved ? <><Save className="w-3.5 h-3.5 mr-2" /> Saved</> : <><BookmarkPlus className="w-3.5 h-3.5 mr-2" /> Save without rating</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
