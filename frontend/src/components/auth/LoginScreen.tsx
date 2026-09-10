import { useState, type FormEvent } from 'react';
import { BarChart3, Loader2, Lock, User } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';

export function LoginScreen() {
  const { login, loggingIn, error } = useAuthContext();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!usuario.trim() || !password) {
      setLocalError('Ingresa usuario y contraseña.');
      return;
    }
    try {
      await login(usuario.trim(), password);
    } catch {
      // El mensaje de error ya queda expuesto vía `error` del contexto.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BarChart3 size={22} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Dashboard de Abastecimiento</h1>
          <p className="text-sm text-slate-400">Inicia sesión con tu usuario del sistema de Logística</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label-text" htmlFor="usuario">
              Usuario
            </label>
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                className="input pl-8"
                placeholder="usuario.compras"
              />
            </div>
          </div>

          <div>
            <label className="label-text" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="input pl-8"
                placeholder="••••••••"
              />
            </div>
          </div>

          {(localError || error) && <p className="text-sm font-medium text-rose-600">{localError ?? error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loggingIn}>
            {loggingIn ? <Loader2 size={16} className="animate-spin" /> : null}
            Iniciar sesión
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Usa las mismas credenciales del sistema de Logística / Compras.
        </p>
      </div>
    </div>
  );
}
