import { type ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({
  children,
  className = "",
  hover = false,
}: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.3)] ${
        hover
          ? "transition-all duration-300 hover:border-glass-hover hover:bg-glass-hover hover:shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
