interface CardProps {
  children: React.ReactNode;
  interactive?: boolean;
  className?: string;
}

export function Card({ children, interactive = false, className = "" }: CardProps) {
  const hover = interactive ? "hover:shadow-md transition-shadow" : "";
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm ${hover} ${className}`}
    >
      {children}
    </div>
  );
}
