import { Button } from "./Button.js";

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}

/** Painel de modal genérico — slot de conteúdo livre, sem botões pré-definidos. */
export function Modal({ children, onClose, className = "" }: ModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Variante de confirmação — mesma anatomia do ConfirmModal original do wz-agente. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal onClose={onCancel}>
      <div className="flex items-start gap-4">
        <div className={`text-3xl shrink-0 ${danger ? "text-red-500" : "text-amber-500"}`}>
          {danger ? "⚠️" : "❓"}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">
            {title}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          className="flex-1"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
