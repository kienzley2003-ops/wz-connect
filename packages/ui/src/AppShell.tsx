import type { ReactNode } from "react";
import { useDarkMode } from "./useDarkMode.js";

export interface NavLinkItem {
  to: string;
  icon: string;
  label: string;
}

export interface NavSectionItem {
  label: string;
  links: NavLinkItem[];
}

interface AppShellProps {
  children: ReactNode;
  brand: string;
  sections: NavSectionItem[];
  userEmail?: string;
  onLogout: () => void;
  /** Componente de link a ser usado internamente — ex: `Link` do react-router-dom.
   *  Recebe `to`/`className`/`children` para funcionar com qualquer roteador. */
  LinkComponent: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
  isActive: (to: string) => boolean;
  headerExtra?: ReactNode;
  footerExtra?: ReactNode;
}

/**
 * Generalização do Layout.tsx do wz-agente: mesma anatomia visual (sidebar
 * escura fixa, seções em uppercase tracking-widest, rodapé com conta/logout),
 * porém o menu é passado como prop em vez de hardcoded — cada produto/modo
 * (Hub Admin, Org Admin, ou qualquer app futuro do hub) define sua própria
 * navegação sem duplicar este componente.
 */
export function AppShell({
  children,
  brand,
  sections,
  userEmail,
  onLogout,
  LinkComponent,
  isActive,
  headerExtra,
  footerExtra,
}: AppShellProps) {
  const { dark, toggle: toggleDark } = useDarkMode();

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900">
      <aside className="w-56 bg-slate-800 text-white flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-700 space-y-2">
          <p className="font-bold text-lg leading-tight">{brand}</p>
          {headerExtra}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.label} className="mb-3">
              <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.links.map((link) => (
                  <LinkComponent
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                      isActive(link.to)
                        ? "bg-slate-600 text-white font-medium"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span>{link.icon}</span> {link.label}
                  </LinkComponent>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            {userEmail && <p className="text-xs text-slate-500 truncate flex-1">{userEmail}</p>}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleDark}
                className="p-1.5 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                title={dark ? "Modo claro" : "Modo escuro"}
              >
                {dark ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
          {footerExtra}
          <button
            onClick={onLogout}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto dark:bg-slate-900 dark:text-slate-100">
        {children}
      </main>
    </div>
  );
}
