import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.redirected) return;
      if (result.error) throw result.error;
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error("Couldn't sign in with Google. Please try again.");
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

        <Button
          type="button"
          variant="outline"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full h-11 mb-5 gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Continue with Google
        </Button>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">or</span></div>
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
