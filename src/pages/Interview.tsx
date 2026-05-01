import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReferences, useReferenceUrls, type Reference } from "@/hooks/useReferences";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { Button } from "@/components/ui/button";
import { LabelChip, type LabelKind } from "@/components/LabelChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2, Upload, X, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Stage = "upload" | "interview" | "summary";
interface ChatMsg { role: "assistant" | "user"; content: string; refId?: string }

export default function TastePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refs, refetch, setRefs } = useReferences(user?.id);
  const { refetch: refetchProfile } = useTasteProfile();
  const urls = useReferenceUrls(refs);

  const [stage, setStage] = useState<Stage>("upload");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const counts = useMemo(() => ({
    good: refs.filter((r) => r.label === "good").length,
    bad: refs.filter((r) => r.label === "bad").length,
    best: refs.filter((r) => r.label === "best").length,
  }), [refs]);
  const ready = counts.good >= 1 && counts.bad >= 1 && counts.best >= 1;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    setUploading(true);
    try {
      for (const f of arr) {
        const ext = f.name.split(".").pop() ?? "png";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("references")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase
          .from("references")
          .insert({ user_id: user.id, storage_path: path, label: "good" });
        if (insErr) throw insErr;
      }
      await refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [user, refetch]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const updateLabel = async (id: string, label: LabelKind) => {
    setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
    await supabase.from("references").update({ label }).eq("id", id);
  };

  const removeRef = async (r: Reference) => {
    await supabase.from("references").delete().eq("id", r.id);
    await supabase.storage.from("references").remove([r.storage_path]);
    setRefs((prev) => prev.filter((x) => x.id !== r.id));
  };

  // Interview state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const exchangeCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);

  const startInterview = () => {
    if (!ready) {
      toast.error("Need 1 Good, 1 Bad, 1 Best to start.");
      return;
    }
    const first = refs[0];
    const opener: ChatMsg = {
      role: "assistant",
      content: `You marked this as ${first.label}. What caught you?`,
      refId: first.id,
    };
    setMessages([opener]);
    setCurrentIdx(0);
    setStage("interview");
  };

  const sendReply = async () => {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setThinking(true);

    try {
      const nextIdx = Math.min(currentIdx + 1, refs.length - 1);
      const nextRef = refs[nextIdx];
      const contextMessages = newMsgs.map((m) => ({ role: m.role, content: m.content }));
      contextMessages.push({
        role: "user",
        content: `(Context: next image is labeled "${nextRef.label}".)`,
      });

      const { data, error } = await supabase.functions.invoke("interview-chat", {
        body: { messages: contextMessages, exchangeCount: exchangeCount + 1 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.done) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        setInterviewDone(true);
      } else {
        setCurrentIdx(nextIdx);
        setMessages((prev) => [...prev, { role: "assistant", content: data.message, refId: nextRef.id }]);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Chat error");
    } finally {
      setThinking(false);
    }
  };

  // Synthesize
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthElapsed, setSynthElapsed] = useState(0);
  const [draft, setDraft] = useState<{ summary: string; values: string[]; avoid: string[] } | null>(null);

  // tick during synth
  useMemo(() => {
    if (!synthesizing) { setSynthElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setSynthElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesizing]);

  const synthesize = async () => {
    setSynthesizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("synthesize-profile", {
        body: {
          transcript: messages.map((m) => ({ role: m.role, content: m.content })),
          references: refs.map((r) => ({ label: r.label, commentary: r.commentary })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft({ summary: data.summary, values: data.values, avoid: data.avoid });
      setStage("summary");
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't synthesize");
    } finally {
      setSynthesizing(false);
    }
  };

  const saveProfile = async () => {
    if (!user || !draft) return;
    const payload = {
      user_id: user.id,
      summary: draft.summary,
      values: draft.values,
      avoid: draft.avoid,
      interview_transcript: messages as any,
    };
    const { error } = await supabase
      .from("taste_profiles")
      .upsert([payload], { onConflict: "user_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refetchProfile();
    toast.success("Profile saved.");
    navigate("/profile");
  };

  // ---------- RENDER ----------

  if (stage === "upload") {
    return (
      <div className="px-5 md:px-12 py-10 md:py-16 max-w-5xl mx-auto md:mx-0">
        <div className="text-eyebrow mb-3">Step 1 of 3</div>
        <h1 className="font-serif text-4xl md:text-5xl text-ink mb-3 leading-tight">Design Your Taste.</h1>
        <p className="text-[15px] text-muted-foreground max-w-xl leading-relaxed mb-8 md:mb-12">
          Upload work. Label each as Good, Bad, or Best. Need at least one of each.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-md py-12 md:py-16 px-4 text-center cursor-pointer transition-colors ${
            dragOver ? "border-ink bg-secondary/40" : "border-border hover:border-ink/40"
          }`}
        >
          <Upload className="w-5 h-5 mx-auto mb-3 text-muted-foreground" />
          <div className="text-sm text-ink mb-1">
            {uploading ? "Uploading…" : "Drag images, or tap to browse"}
          </div>
          <div className="text-xs text-ink-faint">PNG · JPG · WebP</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {refs.length > 0 && (
          <div className="mt-10 md:mt-12">
            <div className="flex items-baseline justify-between mb-5 md:mb-6">
              <div className="text-eyebrow">{refs.length} uploaded</div>
              <div className="text-xs text-muted-foreground">
                {ready ? "Ready" : `Need ${counts.good < 1 ? "Good " : ""}${counts.bad < 1 ? "Bad " : ""}${counts.best < 1 ? "Best" : ""}`.trim()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
              {refs.map((r) => (
                <div key={r.id} className="group relative">
                  <div className="aspect-[4/3] bg-secondary/40 rounded overflow-hidden border border-border">
                    {urls[r.id] ? (
                      <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-faint text-xs">…</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRef(r); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 border border-border opacity-100 md:opacity-0 md:group-hover:opacity-100 transition flex items-center justify-center text-ink-faint hover:text-ink"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="flex gap-1.5 mt-3">
                    {(["good", "bad", "best"] as LabelKind[]).map((k) => (
                      <LabelChip key={k} kind={k} active={r.label === k} onClick={() => updateLabel(r.id, k)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 md:mt-12 flex flex-wrap items-center gap-4">
              <Button onClick={startInterview} disabled={!ready} className="h-12 px-8 w-full sm:w-auto">
                Start
              </Button>
              <span className="text-xs text-ink-faint">~6–10 quick questions.</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === "interview") {
    const focusRef = refs[currentIdx];
    return (
      <div className="px-5 md:px-12 py-8 md:py-12 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 md:mb-10">
          <div className="text-eyebrow">Step 2 of 3</div>
          <div className="text-xs text-ink-faint">{exchangeCount} of ~8</div>
        </div>

        {focusRef && (
          <div className="mb-8 md:mb-10 animate-fade-in">
            <div className="aspect-[16/10] bg-secondary/40 rounded border border-border overflow-hidden max-h-[420px] flex items-center justify-center">
              {urls[focusRef.id] ? (
                <img src={urls[focusRef.id]} alt="" className="w-full h-full object-contain" />
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <LabelChip kind={focusRef.label} active />
              <span className="text-xs text-ink-faint">Your label</span>
            </div>
          </div>
        )}

        <div className="space-y-5 md:space-y-6 mb-6 md:mb-8">
          {messages.slice(-4).map((m, i) => (
            <div key={i} className={m.role === "assistant" ? "" : "pl-5 border-l-2 border-border"}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-faint mb-2">
                {m.role === "assistant" ? "Muse" : "You"}
              </div>
              <div className={m.role === "assistant" ? "font-serif text-xl md:text-2xl text-ink leading-snug" : "text-[15px] text-ink leading-relaxed"}>
                {m.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="text-sm text-ink-faint flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> thinking…
            </div>
          )}
        </div>

        {!interviewDone ? (
          <div className="border-t border-border pt-5 md:pt-6">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
              placeholder="Type… ⌘↵ to send"
              rows={3}
              className="bg-transparent border-border text-[15px] resize-none focus-visible:ring-0 focus-visible:border-ink/40 min-h-[88px]"
            />
            <div className="flex justify-end mt-3">
              <Button onClick={sendReply} disabled={!input.trim() || thinking} className="h-12 px-6">
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-border pt-7 md:pt-8 text-center">
            <p className="text-sm text-muted-foreground mb-5">See your profile?</p>
            <Button onClick={synthesize} disabled={synthesizing} className="h-12 px-8 w-full sm:w-auto">
              {synthesizing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Synthesizing…</> : "Show profile"}
            </Button>
            {synthesizing && (
              <div className="mt-6 max-w-sm mx-auto text-left">
                <div className="flex items-center gap-2 text-xs text-ink mb-2">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                  Reading your taste… <span className="ml-auto text-muted-foreground tabular-nums">~{Math.max(0, 18 - Math.ceil(synthElapsed))}s</span>
                </div>
                <Progress value={Math.min(96, (synthElapsed / 18) * 100)} className="h-1.5" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // SUMMARY
  return (
    <div className="px-5 md:px-12 py-10 md:py-16 max-w-3xl mx-auto">
      <div className="text-eyebrow mb-3">Step 3 of 3</div>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-3 leading-tight">Your taste.</h1>
      <p className="text-sm text-muted-foreground mb-10 md:mb-12">Edit anything off, then save.</p>

      {draft && (
        <div className="space-y-10 md:space-y-12">
          <section>
            <div className="text-eyebrow mb-3">Summary</div>
            <Textarea
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              rows={5}
              className="bg-transparent border-border font-serif text-xl md:text-2xl leading-snug resize-none focus-visible:ring-0 focus-visible:border-ink/40 p-4"
            />
          </section>

          <EditableTagList label="Values" tags={draft.values} onChange={(values) => setDraft({ ...draft, values })} />
          <EditableTagList label="Avoid" tags={draft.avoid} onChange={(avoid) => setDraft({ ...draft, avoid })} />

          <ReferenceGroupSummary refs={refs} urls={urls} />

          <div className="pt-5 md:pt-6 border-t border-border flex flex-wrap gap-3">
            <Button onClick={saveProfile} className="h-12 px-8">Save</Button>
            <Button variant="ghost" onClick={() => setStage("interview")} className="h-12">Back</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableTagList({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  return (
    <section>
      <div className="text-eyebrow mb-3">{label}</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((t, i) => (
          <span key={i} className="group inline-flex items-center gap-1.5 border border-border rounded-full px-3 py-1 text-xs text-ink">
            {t}
            <button
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="text-ink-faint hover:text-ink opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            onChange([...tags, input.trim()]);
            setInput("");
          }
        }}
        placeholder="Add + Enter"
        className="bg-transparent border-b border-border text-sm py-2 focus:outline-none focus:border-ink/40 w-full max-w-xs"
      />
    </section>
  );
}

function ReferenceGroupSummary({ refs, urls }: { refs: Reference[]; urls: Record<string, string> }) {
  const groups: { label: LabelKind; items: Reference[] }[] = [
    { label: "best", items: refs.filter((r) => r.label === "best") },
    { label: "good", items: refs.filter((r) => r.label === "good") },
    { label: "bad", items: refs.filter((r) => r.label === "bad") },
  ];
  return (
    <section>
      <div className="text-eyebrow mb-4">References</div>
      <div className="space-y-7 md:space-y-8">
        {groups.map((g) =>
          g.items.length > 0 ? (
            <div key={g.label}>
              <div className="mb-3"><LabelChip kind={g.label} active /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {g.items.map((r) => (
                  <div key={r.id} className="aspect-[4/3] bg-secondary/40 rounded overflow-hidden border border-border">
                    {urls[r.id] && <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />}
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>
    </section>
  );
}
