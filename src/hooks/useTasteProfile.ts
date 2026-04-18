import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface TasteProfile {
  id: string;
  user_id: string;
  summary: string;
  values: string[];
  avoid: string[];
  interview_transcript: any;
  updated_at: string;
}

export function useTasteProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile((data as any) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { profile, loading, refetch };
}
