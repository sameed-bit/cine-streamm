import { useState } from "react";
import { Link } from "wouter";
import { supabase } from "./supabase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset link bhej diya gaya hai. Inbox aur Spam folder check karo.");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold">Forgot Password</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && <p className="text-sm text-green-400">{message}</p>}

          <input
            type="email"
            placeholder="Apna email likho"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="text-primary underline">
            Back to Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}