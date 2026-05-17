// Tiny inline SVG icon set — no external dep. Stroke uses currentColor so
// styling cascades naturally.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Plus: (p: IconProps) => svg({ ...p, children: (<><path d="M12 5v14" /><path d="M5 12h14" /></>) }),
  Send: (p: IconProps) => svg({ ...p, children: (<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>) }),
  Stop: (p: IconProps) => svg({ ...p, children: <rect x="6" y="6" width="12" height="12" rx="2" /> }),
  Trash: (p: IconProps) => svg({ ...p, children: (<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>) }),
  Search: (p: IconProps) => svg({ ...p, children: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>) }),
  Folder: (p: IconProps) => svg({ ...p, children: <path d="M4 4h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /> }),
  FolderPlus: (p: IconProps) => svg({ ...p, children: (<><path d="M4 4h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M12 11v6" /><path d="M9 14h6" /></>) }),
  Inbox: (p: IconProps) => svg({ ...p, children: (<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>) }),
  Notes: (p: IconProps) => svg({ ...p, children: (<><path d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M14 4v6h6" /></>) }),
  Chat: (p: IconProps) => svg({ ...p, children: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /> }),
  Sparkles: (p: IconProps) => svg({ ...p, children: (<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3" /></>) }),
  Command: (p: IconProps) => svg({ ...p, children: <path d="M18 3a3 3 0 1 0 0 6h-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v3H6a3 3 0 1 0 0 6h3v3a3 3 0 1 0 6 0v-3h3a3 3 0 1 0 0-6h-3V6a3 3 0 0 0-3-3z" /> }),
  X: (p: IconProps) => svg({ ...p, children: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>) }),
  Edit: (p: IconProps) => svg({ ...p, children: (<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="m18.5 2.5 3 3L12 15l-4 1 1-4z" /></>) }),
  Check: (p: IconProps) => svg({ ...p, children: <path d="M20 6 9 17l-5-5" /> }),
  Loader: (p: IconProps) => svg({ ...p, className: "spin", children: (<><path d="M12 2v4" /><path d="M12 18v4" /><path d="m4.93 4.93 2.83 2.83" /><path d="m16.24 16.24 2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="m4.93 19.07 2.83-2.83" /><path d="m16.24 7.76 2.83-2.83" /></>) }),
  Mic: (p: IconProps) => svg({ ...p, children: (<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /><path d="M8 21h8" /></>) }),
  Dot: (p: IconProps) => svg({ ...p, children: <circle cx="12" cy="12" r="4" fill="currentColor" /> }),
};
