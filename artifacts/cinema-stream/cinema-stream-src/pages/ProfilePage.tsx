import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth-context';
import { supabase } from '@/supabase';

export function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState(
    (user?.user_metadata?.full_name as string) || ''
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  if (loading) return <p className="p-8">Loading…</p>;

  if (!user) {
    return (
      <div className="p-8">
        <p>Please sign in.</p>
      </div>
    );
  }

  const handleUpdateName = async () => {
    setSaving(true);
    setMsg('');
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name },
    });
    setSaving(false);
    if (error) setMsg(error.message);
    else setMsg('Name updated!');
  };

  const handleChangePassword = async () => {
    const newPass = prompt('Enter new password (min 6 characters)');
    if (!newPass || newPass.length < 6) return;

    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) alert(error.message);
    else alert('Password updated successfully');
  };

  const handleSignOut = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <div className="max-w-md space-y-8 pt-6">
      <h1 className="text-3xl font-bold">Profile</h1>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Email</label>
        <p className="font-medium">{user.email}</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Display Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <button
          onClick={handleUpdateName}
          disabled={saving}
          className="mt-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {saving ? 'Saving…' : 'Save Name'}
        </button>
        {msg && <p className="text-sm text-green-400">{msg}</p>}
      </div>

      <div className="flex flex-col gap-3 pt-4">
        <button
          onClick={handleChangePassword}
          className="rounded border border-white/20 px-4 py-2 text-sm"
        >
          Change Password
        </button>
        <button
          onClick={handleSignOut}
          className="rounded border border-red-500/50 px-4 py-2 text-sm text-red-400"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}