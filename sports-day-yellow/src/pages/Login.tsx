import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { signIn } from '../lib/supabaseSource';
import { Button } from '../components/ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await signIn(email.trim(), password);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-400 text-2xl font-black text-ink">Y</div>
          <h1 className="text-xl font-bold">กีฬาสีเหลือง 2569</h1>
          <p className="text-sm text-gray-500">Horizon Group · เข้าสู่ระบบสำหรับเจ้าหน้าที่</p>
        </div>
        <label className="block text-sm font-semibold text-gray-700">อีเมล
          <input className="input mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-3 block text-sm font-semibold text-gray-700">รหัสผ่าน
          <input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <Button type="submit" className="mt-5 w-full" loading={busy}><LogIn className="h-4 w-4" /> เข้าสู่ระบบ</Button>
        <p className="mt-4 text-center text-xs text-gray-400">บัญชีผู้ใช้สร้างโดยผู้ดูแลระบบใน Supabase</p>
      </form>
    </div>
  );
}
