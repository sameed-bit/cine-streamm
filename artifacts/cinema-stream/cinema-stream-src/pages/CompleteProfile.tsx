import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth-context';
import { supabase } from '@/supabase';

export function CompleteProfile() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Agar already name hai to seedha home pe bhej do
  if (!loading && user?.user_metadata?.full_name) {
    setLocation('/');
    return null;
  }

  if (loading) return <p className="p-10 text-center">Loading…</p>;
  if (!user) {
    setLocation('/sign-in');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const ageNum = Number(age);
    if (!age || isNaN(ageNum) || ageNum < 5 || ageNum > 120) {
      setError('Please enter a valid age (5-120)');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: name.trim(),
        age: ageNum,
      },
    });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Profile complete → home pe bhej do
    setLocation('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-black/50 p-8"
      >
        <div>
          <h1 className="text-2xl font-bold">Welcome!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please tell us a bit about yourself
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-2.5 outline-none focus:border-primary"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Your Age</label>
          <input
            type="number"
            value={age}
            onChange={e => setAge(e.target.value)}
            placeholder="Enter your age"
            min={5}
            max={120}
            className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-2.5 outline-none focus:border-primary"
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}