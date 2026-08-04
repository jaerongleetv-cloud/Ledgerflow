"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const router = useRouter();
  const { isAuthenticated, isLoadingAuth, signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) router.replace("/");
  }, [isAuthenticated, isLoadingAuth, router]);

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        router.replace("/");
      } else {
        const data = await signUp(email.trim(), password);
        if (data.session) router.replace("/");
        else setMessage("Check your email to confirm your account, then sign in.");
      }
    } catch (authFailure) {
      setError(authFailure.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-primary text-lg font-bold text-primary-foreground">$</div>
          <div><h1 className="text-xl font-bold">LedgerFlow</h1><p className="text-sm text-muted-foreground">{mode === "signin" ? "Sign in to your ledger" : "Create your ledger account"}</p></div>
        </div>

        <div className="mb-5 grid grid-cols-2 border p-1">
          <button type="button" className={`h-9 text-sm font-medium ${mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>Sign in</button>
          <button type="button" className={`h-9 text-sm font-medium ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Sign up</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="auth-email">Email</Label><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div><Label htmlFor="auth-password">Password</Label><Input id="auth-password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          <Button type="submit" className="w-full" disabled={loading || !email.trim() || password.length < 8}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </div>
    </main>
  );
}
