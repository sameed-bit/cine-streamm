import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "./supabase";

export function SignInPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLocation("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Don’t have an account?{" "}
          <button type="button" onClick={() => setLocation("/signup")} className="text-primary underline">
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
}

export function SignUpPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLocation("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold">Create account</h1>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button type="button" onClick={() => setLocation("/signin")} className="text-primary underline">
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}
