import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Reference {
  id: string;
  user_id: string;
  storage_path: string;
  label: "good" | "bad" | "best";
  commentary: string | null;
  created_at: string;
  signedUrl?: string;
}

export function useReferenceUrls(refs: Reference[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const need = refs.filter((r) => !urls[r.id]);
    if (need.length === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        need.map(async (r) => {
          const { data } = await supabase.storage
            .from("references")
            .createSignedUrl(r.storage_path, 60 * 60);
          if (data?.signedUrl) next[r.id] = data.signedUrl;
        })
      );
      if (!cancelled && Object.keys(next).length) {
        setUrls((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.map((r) => r.id).join(",")]);

  return urls;
}

export function useReferences(userId: string | undefined) {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) { setRefs([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("references")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setRefs((data as any) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { refs, loading, refetch, setRefs };
}
