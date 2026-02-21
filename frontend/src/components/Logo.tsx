interface LogoProps {
  size?: number;
  className?: string;
  /** If true renders only the icon, no text */
  iconOnly?: boolean;
}

export function LogoIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded square background */}
      <rect width="32" height="32" rx="9" fill="currentColor" opacity="0.1" />

      {/* Waveform bars — 5 bars forming a voice spectrum curve */}
      {/* Bar 1 — short */}
      <rect x="5.5" y="13" width="3" height="6" rx="1.5" fill="currentColor" opacity="0.55" />
      {/* Bar 2 — medium */}
      <rect x="10.5" y="10.5" width="3" height="11" rx="1.5" fill="currentColor" opacity="0.75" />
      {/* Bar 3 — tallest (center) */}
      <rect x="15.5" y="7" width="3" height="18" rx="1.5" fill="currentColor" />
      {/* Bar 4 — medium */}
      <rect x="20.5" y="10.5" width="3" height="11" rx="1.5" fill="currentColor" opacity="0.75" />
      {/* Bar 5 — short */}
      <rect x="25.5" y="13" width="1" height="6" rx="0.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Logo({ size = 32, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={size} />
      <span
        className="font-semibold tracking-tight"
        style={{
          fontSize: size * 0.44,
          color: "var(--foreground)",
          letterSpacing: "-0.02em",
        }}
      >
        OpusVoice
      </span>
    </div>
  );
}
