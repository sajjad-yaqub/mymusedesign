import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasteProfile } from "@/hooks/useTasteProfile";
import { useReferences, useReferenceUrls } from "@/hooks/useReferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LabelChip, type LabelKind } from "@/components/LabelChip";
import { X } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { profile, loading, refetch } = useTasteProfile();
  const { refs } = useReferences(user?.id);
  const urls = useReferenceUrls(refs);

  const [summary, setSummary] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState({ values: "", avoid: "" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setSummary(profile.summary);
      setValues(profile.values);
      setAvoid(profile.avoid);
      setDirty(false);
    }
  }, [profile]);

  if (loading) return null;

  if (!profile) {
    return (
      <div className="px-5 md:px-12 py-16 md:py-24 max-w-2xl mx-auto md:mx-0">
        <h1 className="font-serif text-3xl md:text-4xl text-ink mb-3">No profile yet.</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">Build it in a few minutes.</p>
        <Button onClick={() => navigate("/taste")} className="h-12 px-8">Design Your Taste</Button>
      </div>
    );
  }

  const save = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("taste_profiles")
      .update({ summary, values, avoid })
      .eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    await refetch();
    setDirty(false);
  };

  const groups: { label: LabelKind }[] = [{ label: "best" }, { label: "good" }, { label: "bad" }];

  return (
    <div className="px-5 md:px-12 py-10 md:py-16 w-full">
      <div className="flex items-baseline justify-between mb-10 md:mb-12 gap-4">
        <div>
          <div className="text-eyebrow mb-3">Profile</div>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-tight">Your taste.</h1>
        </div>
        <Link to="/taste" className="text-sm text-muted-foreground hover:text-ink shrink-0">
          Redo →
        </Link>
      </div>

      <div className="space-y-12">
        <section>
          <div className="text-eyebrow mb-3">Summary</div>
          <Textarea
            value={summary}
            onChange={(e) => { setSummary(e.target.value); setDirty(true); }}
            rows={5}
            className="bg-transparent border-border font-serif text-2xl leading-snug resize-none focus-visible:ring-0 focus-visible:border-ink/40 p-4"
          />
        </section>

        <TagSection
          label="Values"
          tags={values}
          input={tagInput.values}
          onInput={(v) => setTagInput((s) => ({ ...s, values: v }))}
          onChange={(t) => { setValues(t); setDirty(true); }}
        />

        <TagSection
          label="Avoid"
          tags={avoid}
          input={tagInput.avoid}
          onInput={(v) => setTagInput((s) => ({ ...s, avoid: v }))}
          onChange={(t) => { setAvoid(t); setDirty(true); }}
        />

        <section>
          <div className="text-eyebrow mb-4">References</div>
          <div className="space-y-8">
            {groups.map(({ label }) => {
              const items = refs.filter((r) => r.label === label);
              if (items.length === 0) return null;
              return (
                <div key={label}>
                  <div className="mb-3"><LabelChip kind={label} active /></div>
                  <div className="flex flex-wrap gap-3">
                    {items.map((r) => (
                      <div key={r.id} className="h-32 md:h-36 bg-secondary/40 rounded overflow-hidden border border-border shrink-0">
                        {urls[r.id] && <img src={urls[r.id]} alt="" className="h-full w-auto object-cover" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {dirty && (
          <div className="sticky bottom-20 md:bottom-6 flex flex-wrap gap-3 pt-4 border-t border-border bg-background/80 backdrop-blur">
            <Button onClick={save} className="h-12 px-6">Save</Button>
            <Button variant="ghost" onClick={() => { if (profile) { setSummary(profile.summary); setValues(profile.values); setAvoid(profile.avoid); setDirty(false); } }} className="h-12">
              Discard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TagSection({ label, tags, input, onInput, onChange }: {
  label: string; tags: string[]; input: string; onInput: (v: string) => void; onChange: (t: string[]) => void;
}) {
  return (
    <section>
      <div className="text-eyebrow mb-3">{label}</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((t, i) => (
          <span key={i} className="group inline-flex items-center gap-1.5 border border-border rounded-full px-3 py-1 text-xs text-ink">
            {t}
            <button
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            onChange([...tags, input.trim()]);
            onInput("");
          }
        }}
        placeholder="Add + Enter"
        className="bg-transparent border-b border-border text-sm py-1 focus:outline-none focus:border-ink/40 w-full max-w-xs"
      />
    </section>
  );
}
