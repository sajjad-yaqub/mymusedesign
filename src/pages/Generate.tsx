import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { useReferences } from "@/hooks/useReferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Upload, X, BookmarkPlus, Save, Sparkles, Download } from "lucide-react";
import { LabelChip, type LabelKind } from "@/components/LabelChip";
import { Link } from "react-router-dom";

type FormatId = "landing" | "app" | "image";

const FORMATS: { id: FormatId; label: string }[] = [
  { id: "landing", label: "Landing Page" },
  { id: "app", label: "App UI" },
  { id: "image", label: "Image" },
];

const DIMENSIONS = [
  { id: "1024x1024", label: "Square 1:1" },
  { id: "1024x1280", label: "Portrait 4:5" },
  { id: "1024x1820", label: "Story 9:16" },
  { id: "1820x1024", label: "Landscape 16:9" },
  { id: "custom", label: "Custom" },
];

type Output = { id?: string; result: string; rationale: string };

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

  const [brief, setBrief] = useState("");
  const [link, setLink] = useState("");
  const [format, setFormat] = useState<FormatId>("image");
  const [dimensions, setDimensions] = useState("1024x1024");
  const [customDim, setCustomDim] = useState({ w: 1024, h: 1024 });
  const [inspirations, setInspirations] = useState<{ id: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState<Output | null>(null);
  const [savingRef, setSavingRef] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [historySaved, setHistorySaved] = useState(false);
  const [refSaved, setRefSaved] = useState(false);
  const [skipProfile, setSkipProfile] = useState(false);

  const ESTIMATE_S: Record<FormatId, number> = { image: 35, landing: 50, app: 50 };
  const estimate = ESTIMATE_S[format] ?? 40;

  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(t);
  }, [busy]);

  const STEPS = [
    "Reading your taste",
    "Studying references",
    link ? "Pulling brand vibe" : "Composing layout",
    "Rendering image",
    "Almost there",
  ];
  const stepIdx = Math.min(STEPS.length - 1, Math.floor((elapsed / Math.max(estimate, 1)) * STEPS.length));
  const pct = Math.min(96, (elapsed / Math.max(estimate, 1)) * 100);
  const remaining = Math.max(0, Math.ceil(estimate - elapsed));
  const overrun = elapsed > estimate;

  if (loading) return null;

  if (!profile && !skipProfile) {
    return (
      <div className="px-5 md:px-12 py-12 md:py-20 max-w-2xl mx-auto">
        <div className="text-eyebrow mb-3">Generate</div>
        <h1 className="font-serif text-4xl md:text-5xl text-ink mb-3 leading-tight">Start here.</h1>
        <p className="text-ink-faint text-[15px] leading-relaxed mb-10">Pick one.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link
            to="/taste"
            className="block rounded-md border border-border hover:border-ink/50 p-6 transition group"
          >
            <div className="font-serif text-2xl text-ink mb-2 leading-tight">Design with your taste</div>
            <p className="text-sm text-ink-faint leading-relaxed">Sharper, on-brand output.</p>
            <div className="text-xs text-ink mt-4 group-hover:underline">Build profile →</div>
          </Link>
          <button
            type="button"
            onClick={() => setSkipProfile(true)}
            className="block text-left rounded-md border border-border hover:border-ink/50 p-6 transition group"
          >
            <div className="font-serif text-2xl text-ink mb-2 leading-tight">Design anyway</div>
            <p className="text-sm text-ink-faint leading-relaxed">No profile. Just make it.</p>
            <div className="text-xs text-ink mt-4 group-hover:underline">Skip →</div>
          </button>
        </div>
      </div>
    );
  }

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

  const removeInspiration = (id: string) => setInspirations((p) => p.filter((i) => i.id !== id));

  const generate = async () => {
    if (!brief.trim()) {
      toast.error("Tell me what to make.");
      return;
    }
    setBusy(true);
    setHistorySaved(false);
    setRefSaved(false);
    try {
      const allReferences = refs.map((r) => ({ label: r.label, commentary: r.commentary }));
      const dimToSend = format === "image"
        ? (dimensions === "custom" ? `${customDim.w}x${customDim.h}` : dimensions)
        : null;

      const { data, error } = await supabase.functions.invoke("generate-output", {
        body: {
          brief,
          format,
          profile: profile ?? { summary: "", values: [], avoid: [] },
          allReferences,
          link: link.trim() || null,
          inspirationImages: inspirations.map((i) => i.dataUrl),
          imageDimensions: dimToSend,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: inserted } = await supabase
        .from("generations")
        .insert({
          user_id: user!.id,
          brief,
          link: link.trim() || null,
          reference_ids: refs.map((r) => r.id),
          inspirations: [],
          output_format: format,
          image_dimensions: dimToSend,
          result: data.result,
          rationale: data.rationale,
          saved_to_history: false,
        })
        .select("id")
        .single();

      setOutput({ id: inserted?.id, result: data.result, rationale: data.rationale });
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadImage = () => {
    if (!output) return;
    const a = document.createElement("a");
    a.href = output.result;
    a.download = `my-muse-${Date.now()}.png`;
    a.click();
  };

  const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

  const saveToReferences = async (rating: LabelKind) => {
    if (!output || !user) return;
    setSavingRef(true);
    try {
      const blob = await dataUrlToBlob(output.result);
      const path = `${user.id}/generated-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from("references").upload(path, blob, {
        contentType: "image/png", upsert: false,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("references").insert({
        user_id: user.id, storage_path: path, label: rating, commentary: brief.slice(0, 200),
      });
      if (dbErr) throw dbErr;
      toast.success(`Saved as ${rating}.`);
      setRefSaved(true);
      refetchRefs();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
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
      toast.success("Saved.");
      setHistorySaved(true);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSavingHistory(false);
    }
  };

  return (
    <div className="px-5 md:px-12 py-10 md:py-16 max-w-3xl mx-auto md:mx-0">
      <div className="text-eyebrow mb-3">Generate</div>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-8 md:mb-12 leading-tight">Make something.</h1>

      <div className="space-y-8 md:space-y-10">
        <div>
          <label className="text-eyebrow block mb-3">What to make</label>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. Fintech landing for freelancers."
            className="bg-transparent border-border text-[15px] resize-none focus-visible:ring-0 focus-visible:border-ink/40 min-h-[88px]"
          />
        </div>

        <div>
          <label className="text-eyebrow block mb-3">
            Reference link <span className="text-ink-faint normal-case tracking-normal">(optional — pulls vibe, palette, logo)</span>
          </label>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yourbrand.com"
            className="bg-transparent border-border text-[14px] focus-visible:ring-0 focus-visible:border-ink/40 h-12"
          />
        </div>

        <div>
          <div className="flex items-end justify-between mb-3">
            <label className="text-eyebrow">Inspiration images <span className="text-ink-faint normal-case tracking-normal">(optional)</span></label>
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
            <p className="text-sm text-ink-faint">Drop screenshots to steer this one.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {inspirations.map((i) => (
                <div key={i.id} className="relative aspect-[4/3] rounded overflow-hidden border border-border">
                  <img src={i.dataUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeInspiration(i.id)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-eyebrow block mb-3">Format</label>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`text-sm px-4 min-h-[44px] rounded-full border transition ${
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
            <label className="text-eyebrow block mb-3">Size</label>
            <div className="flex flex-wrap gap-2">
              {DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDimensions(d.id)}
                  className={`text-sm px-4 min-h-[44px] rounded-full border transition ${
                    dimensions === d.id ? "border-ink text-ink bg-secondary/40" : "border-border text-muted-foreground hover:text-ink"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {dimensions === "custom" && (
              <div className="flex gap-3 mt-4 max-w-sm">
                <Input
                  type="number"
                  value={customDim.w}
                  min={256}
                  max={2048}
                  onChange={(e) => setCustomDim((p) => ({ ...p, w: Number(e.target.value) }))}
                  className="bg-transparent h-12"
                  placeholder="Width"
                />
                <Input
                  type="number"
                  value={customDim.h}
                  min={256}
                  max={2048}
                  onChange={(e) => setCustomDim((p) => ({ ...p, h: Number(e.target.value) }))}
                  className="bg-transparent h-12"
                  placeholder="Height"
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <Button onClick={generate} disabled={busy} className="w-full sm:w-auto h-12 px-8">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : "Generate"}
          </Button>
          {!profile && (
            <p className="text-xs text-ink-faint mt-3">
              No profile. <Link to="/taste" className="underline text-ink">Build one</Link> for sharper output.
            </p>
          )}
        </div>

        {busy && (
          <div className="rounded-lg border border-border bg-card/40 p-5 md:p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-2 text-sm text-ink min-w-0">
                <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />
                <span className="font-medium truncate">{STEPS[stepIdx]}…</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums shrink-0">
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
            <p className="mt-4 text-xs text-ink-faint italic">Good taste takes a beat.</p>
          </div>
        )}
      </div>

      {output && (
        <div className="mt-12 md:mt-16 pt-10 md:pt-12 border-t border-border space-y-6 md:space-y-8 animate-fade-in">
          <div>
            <div className="text-eyebrow mb-3">Result</div>
            <div className="bg-card border border-border rounded p-2 md:p-4">
              <img src={output.result} alt="Generated" className="w-full rounded" />
            </div>
          </div>

          {output.rationale && (
            <div>
              <div className="text-eyebrow mb-2">Why</div>
              <p className="font-serif text-lg md:text-xl text-ink leading-snug">{output.rationale}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadImage} className="h-10">
              <Download className="w-3.5 h-3.5 mr-2" /> Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={savingHistory || historySaved}
              onClick={() => saveToHistory()}
              className="h-10"
            >
              <Save className="w-3.5 h-3.5 mr-2" /> {historySaved ? "Saved" : "Save to history"}
            </Button>
          </div>

          <div>
            <div className="text-eyebrow mb-3">Save as reference</div>
            <div className="flex flex-wrap gap-2">
              {(["good", "bad", "best"] as LabelKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={savingRef || refSaved}
                  onClick={() => saveToReferences(k)}
                  className="disabled:opacity-50"
                >
                  <LabelChip kind={k} active />
                </button>
              ))}
              {refSaved && <span className="text-xs text-ink-faint self-center ml-2">Saved.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
