"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/providers/ThemeProvider";
import { LogoIcon } from "@/components/Logo";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Chat & Debate" },
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
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div style={{ color: "var(--accent)" }}>
            <LogoIcon size={28} />
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)", letterSpacing: "-0.02em" }}
          >
            OpusVoice
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150"
                style={{
                  color: active ? "var(--foreground)" : "var(--foreground-muted)",
                  background: active ? "var(--surface-active)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}

          <span className="mx-2 h-4 w-px" style={{ background: "var(--border)" }} />

          <button
            onClick={toggle}
            title={theme === "light" ? "Dark mode" : "Light mode"}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150"
            style={{ color: "var(--foreground-muted)" }}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </div>
    </nav>
  );
}
