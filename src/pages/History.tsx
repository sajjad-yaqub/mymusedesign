import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface HistoryItem {
  id: string;
  brief: string;
  output_format: string;
  result: string;
  rationale: string | null;
  rating: string | null;
  link: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const fetchItems = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("generations")
      .select("id, brief, output_format, result, rationale, rating, link, created_at")
      .eq("user_id", user.id)
      .eq("saved_to_history", true)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("generations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((p) => p.filter((i) => i.id !== id));
    toast.success("Removed from history.");
  };

  if (loading) return null;

  return (
    <div className="px-12 py-16 max-w-4xl">
      <div className="text-eyebrow mb-4">History</div>
      <h1 className="font-serif text-5xl text-ink mb-12 leading-tight">What you've made.</h1>

      {items.length === 0 ? (
        <div className="text-ink-faint text-[15px] leading-relaxed">
          Nothing saved yet. When you generate something on the{" "}
          <Link to="/generate" className="text-ink underline">Generate</Link> page, hit "Save to history" to keep it here.
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((it) => {
            const isOpen = open === it.id;
            return (
              <li key={it.id} className="py-5">
                <button
                  onClick={() => setOpen(isOpen ? null : it.id)}
                  className="w-full text-left flex items-start justify-between gap-6 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-[11px] tracking-[0.18em] uppercase text-ink-faint">{it.output_format}</span>
                      {it.rating && (
                        <span className="text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 rounded-full border border-border text-ink-faint">
                          {it.rating}
                        </span>
                      )}
                      <span className="text-[11px] text-ink-faint">
                        {new Date(it.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <div className="font-serif text-xl text-ink leading-snug truncate group-hover:opacity-80">
                      {it.brief}
                    </div>
                  </div>
                  <span className="text-xs text-ink-faint mt-1.5">{isOpen ? "Hide" : "Open"}</span>
                </button>

                {isOpen && (
                  <div className="mt-6 space-y-5 animate-fade-in">
                    {it.link && (
                      <div className="text-sm">
                        <span className="text-eyebrow mr-2">Link</span>
                        <a href={it.link} target="_blank" rel="noopener noreferrer" className="text-ink underline inline-flex items-center gap-1">
                          {it.link} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {it.output_format === "image" ? (
                      <img src={it.result} alt="" className="w-full max-w-2xl rounded border border-border" />
                    ) : it.output_format === "html" ? (
                      <iframe
                        title="Preview"
                        srcDoc={it.result}
                        sandbox="allow-same-origin"
                        className="w-full h-[480px] bg-white border border-border rounded"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-[14px] text-ink leading-relaxed font-sans bg-card border border-border rounded p-6 max-h-[420px] overflow-auto">
                        {it.result}
                      </pre>
                    )}

                    {it.rationale && (
                      <div>
                        <div className="text-eyebrow mb-2">Why</div>
                        <p className="font-serif text-lg text-ink leading-snug">{it.rationale}</p>
                      </div>
                    )}

                    <div>
                      <Button variant="outline" size="sm" onClick={() => remove(it.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
