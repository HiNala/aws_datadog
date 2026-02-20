"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/providers/ThemeProvider";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
];

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14"
      style={{
        background: "var(--surface-raised)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
            OpsVoice
          </span>
        </Link>

        {/* Nav + toggle */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150"
                style={{
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  background: isActive ? "var(--surface-active)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Divider */}
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150"
            style={{ color: "var(--foreground-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)";
            }}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </div>
    </nav>
  );
}
