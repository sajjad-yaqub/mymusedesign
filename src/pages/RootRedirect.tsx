import { Navigate } from "react-router-dom";
import { useTasteProfile } from "@/hooks/useTasteProfile";

export default function RootRedirect() {
  const { profile, loading } = useTasteProfile();
  if (loading) return null;
  return <Navigate to={profile ? "/generate" : "/interview"} replace />;
}
