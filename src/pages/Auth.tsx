import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const friendlyError = (raw: string): string => {
    const msg = raw.toLowerCase();

    // Sign in errors
    if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
      return mode === "signin"
        ? "That email and password don't match. Double-check them, or create an account if you're new."
        : "Those details didn't work. Please try again.";
    }
    if (msg.includes("email not confirmed")) {
      return "Please check your inbox and click the confirmation link before signing in.";
    }

    // Sign up errors
    if (msg.includes("user already registered") || msg.includes("already been registered") || msg.includes("already registered")) {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (msg.includes("password should be at least")) {
      return "Your password is too short. Please use at least 6 characters.";
    }
    if (msg.includes("unable to validate email") || msg.includes("invalid email") || msg.includes("invalid format")) {
      return "That doesn't look like a valid email address. Please check and try again.";
    }
    if (msg.includes("signup") && msg.includes("disabled")) {
      return "New sign-ups are temporarily turned off. Please try again later.";
    }
    if (msg.includes("weak") && msg.includes("password")) {
      return "Your password is too weak. Use at least 8 characters with a mix of uppercase letters, lowercase letters, numbers, and a symbol (e.g. Muse@2026).";
    }
    if (msg.includes("pwned") || msg.includes("compromised") || msg.includes("breach") || msg.includes("data breach")) {
      return "This password has appeared in a known data breach. Please choose a different one — at least 8 characters mixing uppercase, lowercase, numbers, and a symbol.";
    }
    if (msg.includes("rate limit") || msg.includes("too many")) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    if (msg.includes("network") || msg.includes("fetch")) {
      return "Connection problem. Please check your internet and try again.";
    }

    return "Something went wrong. Please try again in a moment.";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Please enter your email address.");
      return;
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailValid) {
      toast.error("Please enter a valid email address (e.g. you@example.com).");
      return;
    }
    if (!password) {
      toast.error("Please enter your password.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created. Welcome!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(friendlyError(err?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-12 text-center">
          <div className="font-serif text-3xl text-ink mb-2">My Muse</div>
          <p className="text-sm text-muted-foreground">Personal design intelligence.</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-eyebrow">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-transparent border-border h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-eyebrow">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-transparent border-border h-11"
              required
            />
          </div>

          <Button type="submit" disabled={busy} className="w-full h-11">
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-8 w-full text-center text-sm text-muted-foreground hover:text-ink transition"
        >
          {mode === "signin" ? "No account yet? Create one." : "Already have an account? Sign in."}
        </button>
      </div>
    </div>
  );
}
