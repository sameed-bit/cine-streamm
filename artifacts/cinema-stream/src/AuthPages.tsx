import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "./supabase";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M12 .5C5.73.5.98 5.24.98 11.52c0 5.02 3.26 9.28 7.78 10.78.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.17.69-3.84-1.36-3.84-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.53-.29-5.19-1.27-5.19-5.63 0-1.24.44-2.26 1.17-3.06-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 2.86-.39c.97 0 1.94.13 2.86.39 2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.73.11 3.02.73.8 1.17 1.82 1.17 3.06 0 4.37-2.66 5.34-5.2 5.62.41.36.77 1.06.77 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.66.79.55A11.03 11.03 0 0 0 23.02 11.52C23.02 5.24 18.27.5 12 .5z" />
    </svg>
  );
}

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
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLocation("/");
  };

  const handleGoogle = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) setError(error.message);
  };

  const handleGithub = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-3 py-8 sm:px-4">
      <div className="w-full max-w-lg space-y-4 sm:space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </div>
      <div className="w-full max-w-lg space-y-4 sm:space-y-5 rounded-xl border border-white/10 bg-black/40 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Sign in</h1>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogle}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <button
            type="button"
            onClick={handleGithub}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#181717] py-3 text-sm font-semibold text-white transition hover:bg-[#2b2b2b]"
          >
            <GithubIcon />
            Continue with GitHub
          </button>
        </div>

        <div className="relative text-center text-xs text-muted-foreground">
          <span className="relative z-10 bg-black/40 px-2">or email</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-white/20 bg-transparent px-4 py-3 text-base"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded border border-white/20 bg-transparent px-4 py-3 text-base"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/sign-up" className="text-primary underline">
            Sign up
          </Link>
        </p>
      </div>
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
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLocation("/complete-profile");
  };

  const handleGoogle = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) setError(error.message);
  };

  const handleGithub = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-3 py-8 sm:px-4">
      <div className="w-full max-w-lg space-y-4 sm:space-y-5 rounded-xl border border-white/10 bg-black/40 p-6 sm:p-8">
        <h1 className="text-lg font-semibold">Create account</h1>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogle}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <button
            type="button"
            onClick={handleGithub}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#181717] py-3 text-sm font-semibold text-white transition hover:bg-[#2b2b2b]"
          >
            <GithubIcon />
            Continue with GitHub
          </button>
        </div>

        <div className="relative text-center text-xs text-muted-foreground">
          <span className="relative z-10 bg-black/40 px-2">or email</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-white/20 bg-transparent px-4 py-3 text-base"
          />
          <input
            type="password"
            placeholder="Password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded border border-white/20 bg-transparent px-4 py-3 text-base"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}






