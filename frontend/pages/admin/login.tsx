import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { apiUrl } from '../../lib/api';

export default function AdminLogin() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(apiUrl('/api/admin/login-proxy'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (res.ok) router.push('/admin');
    else setError('Invalid token');
  }

  return <main><h1>Admin Login</h1><form onSubmit={submit}><input value={token} onChange={(e) => setToken(e.target.value)} /><button>Login</button></form><p>{error}</p></main>;
}
