import { type ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = "", hover = false }: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${hover ? "cursor-default" : ""} ${className}`}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--shadow-sm)",
        ...(hover
          ? {
              // hover handled inline via onMouseEnter/Leave in JS
            }
          : {}),
      }}
      onMouseEnter={
        hover
          ? (e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
