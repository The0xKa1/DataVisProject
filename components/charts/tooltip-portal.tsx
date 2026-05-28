"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTooltipStore } from "@/lib/store/tooltip-store";

export function TooltipPortal() {
  const visible = useTooltipStore((s) => s.visible);
  const x = useTooltipStore((s) => s.x);
  const y = useTooltipStore((s) => s.y);
  const html = useTooltipStore((s) => s.html);

  // Defer portal mount until after hydration to avoid SSR/client mismatch
  // on document.body access.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="tooltip"
      aria-hidden={!visible}
      className="pointer-events-none fixed z-[1200] max-w-xs border border-border bg-card/95 px-3 py-2 font-mono text-[11px] leading-snug text-foreground shadow-[-3px_3px_0_var(--accent)] backdrop-blur-sm"
      style={{
        left: x,
        top: y,
        opacity: visible ? 1 : 0,
        transform: `translate3d(0, ${visible ? 0 : 4}px, 0)`,
        transition:
          "opacity 120ms ease-out, transform 160ms cubic-bezier(0.2,0.65,0.25,1)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />,
    document.body
  );
}
