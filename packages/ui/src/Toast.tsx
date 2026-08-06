import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastType = "success" | "danger" | "warning" | "info" | "neutral";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const bgColors: Record<ToastType, string> = {
  success: "bg-green-600",
  danger: "bg-red-600",
  warning: "bg-orange-600",
  info: "bg-blue-600",
  neutral: "bg-slate-700",
};

const icons: Record<ToastType, string> = {
  success: "✅",
  danger: "❌",
  warning: "🚨",
  info: "🔔",
  neutral: "🔔",
};

/**
 * Reimplementação idiomática do ToastContainer do wz-agente (que manipulava
 * o DOM diretamente via document.createElement). Mesma aparência final —
 * cor sólida por tipo, auto-dismiss em 5s — porém como Context + estado React,
 * reutilizável por qualquer app consumidor de @wz/ui.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 ${bgColors[t.type]} text-white rounded-xl shadow-lg px-4 py-3 max-w-sm transition-all duration-300`}
          >
            <span className="text-lg shrink-0">{icons[t.type]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.message && (
                <p className="text-xs opacity-80 mt-0.5 line-clamp-2">{t.message}</p>
              )}
            </div>
            <button
              className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
