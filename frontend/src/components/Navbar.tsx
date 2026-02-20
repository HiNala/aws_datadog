"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Voice Chat",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-glass-border bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden">
            <div
              className="absolute inset-0 rounded-lg"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, rgba(129,140,248,0.9) 0%, rgba(99,102,241,0.8) 40%, rgba(168,85,247,0.6) 80%)",
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative z-10"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            OpsVoice
          </span>
        </Link>

        {/* Nav */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-white/8 text-foreground"
                    : "text-foreground-muted hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span className={isActive ? "text-accent-light" : ""}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right: stack pill */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-glass-border bg-glass-bg px-3 py-1">
          {[
            { label: "Bedrock", color: "#FF9900" },
            { label: "MiniMax", color: "#818cf8" },
            { label: "Datadog", color: "#9b4dca" },
          ].map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: s.color, boxShadow: `0 0 4px ${s.color}80` }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
}
