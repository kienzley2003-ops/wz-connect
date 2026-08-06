export type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral";

const colors: Record<BadgeVariant, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300",
};

const dotColors: Record<BadgeVariant, string> = {
  success: "bg-green-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  neutral: "bg-slate-400",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
}

export function Badge({ variant = "neutral", children, dot = true }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
