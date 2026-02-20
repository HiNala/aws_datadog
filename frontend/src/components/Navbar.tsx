"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/providers/ThemeProvider";
import { LogoIcon } from "@/components/Logo";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/voice", label: "Voice", accent: true },
];

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  isActive,
  accent,
}: {
  href: string;
  label: string;
  isActive: boolean;
  accent?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    color: isActive ? "var(--foreground)" : accent ? "var(--accent)" : "var(--foreground-muted)",
    background: isActive
      ? "var(--surface-active)"
      : accent
        ? "color-mix(in srgb, var(--accent) 8%, transparent)"
        : "transparent",
    border: accent && !isActive ? "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" : "1px solid transparent",
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150"
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = accent
            ? "color-mix(in srgb, var(--accent) 14%, transparent)"
            : "var(--surface-hover)";
          (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = accent
            ? "color-mix(in srgb, var(--accent) 8%, transparent)"
            : "transparent";
          (e.currentTarget as HTMLElement).style.color = accent
            ? "var(--accent)"
            : "var(--foreground-muted)";
        }
      }}
    >
      {accent && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        </svg>
      )}
      {label}
    </Link>
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
          <div style={{ color: "var(--accent)" }}>
            <LogoIcon size={28} />
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)", letterSpacing: "-0.02em" }}
          >
            OpsVoice
          </span>
        </Link>

        {/* Nav + toggle */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              isActive={pathname === item.href}
              accent={item.accent}
            />
          ))}

          <span className="mx-1.5 h-4 w-px" style={{ background: "var(--border)" }} />

          <button
            onClick={toggle}
            title={theme === "light" ? "Dark mode" : "Light mode"}
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
