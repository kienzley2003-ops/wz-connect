import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DashboardResponse } from '@wz/shared';
import { login, fetchSession, fetchDashboard, type Session } from './lib/api.js';
import { ModuleNav } from './components/ModuleNav.js';
import { Dashboard } from './components/Dashboard.js';

const TOKEN_KEY = 'wz_connect_token';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [session, setSession] = useState<Session | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSession(null);
    setDashboard(null);
    setDashboardError(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchSession(token)
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {
        if (active) signOut();
      });
    return () => {
      active = false;
    };
  }, [token, signOut]);

  // Painel só faz sentido com tenant resolvido (token de plataforma não tem métricas).
  useEffect(() => {
    if (!token || !session?.tenant) return;
    let active = true;
    setDashboardError(null);
    fetchDashboard(token)
      .then((d) => {
        if (active) setDashboard(d);
      })
      .catch((err: Error) => {
        // Painel indisponível não derruba o console — mas o erro fica VISÍVEL.
        if (active) setDashboardError(err.message);
      });
    return () => {
      active = false;
    };
  }, [token, session?.tenant]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const issued = await login(String(form.get('email')), String(form.get('password')));
      localStorage.setItem(TOKEN_KEY, issued);
      setToken(issued);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!token || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <form onSubmit={handleLogin} className="w-80 space-y-3 rounded-lg bg-slate-900 p-6">
          <h1 className="text-xl font-bold">WZ Connect</h1>
          <input
            name="email"
            type="email"
            required
            placeholder="E-mail"
            aria-label="E-mail"
            className="w-full rounded bg-slate-800 px-3 py-2"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Senha"
            aria-label="Senha"
            className="w-full rounded bg-slate-800 px-3 py-2"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full rounded bg-sky-600 py-2 font-medium">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-64 space-y-4 border-r border-slate-800 p-4">
        <h1 className="text-lg font-bold">WZ Connect</h1>
        <p className="text-xs text-slate-400">
          {session.email}
          <br />
          {session.tenant ? `Empresa: ${session.tenant}` : 'Plataforma'}
        </p>
        {/* Navegação dinâmica: só os módulos contratados pelo tenant. */}
        <ModuleNav mods={session.mods} />
        <button onClick={signOut} className="text-sm text-slate-400 hover:text-slate-200">
          Sair
        </button>
      </aside>
      <main className="flex-1 space-y-6 p-8">
        <div>
          <h2 className="text-2xl font-semibold">Console</h2>
          <p className="mt-1 text-sm text-slate-400">
            Módulos habilitados: {session.mods.length > 0 ? session.mods.join(', ') : 'nenhum'}
          </p>
        </div>
        {session.tenant && (
          <section>
            <h3 className="mb-3 text-lg font-semibold">Painel (últimas 24h)</h3>
            <Dashboard data={dashboard} error={dashboardError} />
          </section>
        )}
      </main>
    </div>
  );
}
