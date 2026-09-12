"use client";

const paths: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  heart: <path d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 3.9-4 7.2-9 11.2Z" />,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" /></>,
  pin: <><path d="M12 21.5S5 14.6 5 9.8A7 7 0 0 1 19 9.8c0 4.8-7 11.7-7 11.7Z" /><circle cx="12" cy="9.8" r="2.5" /></>,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  shield: <><path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3Z" /><path d="m9 11.8 2.2 2.2L15.5 9.5" /></>,
  back: <path d="M14.5 5 7.5 12l7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />,
  bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l3.5-7H14l4 7M9.5 10 8 6.5h2.5M14 10l-1.5-5H15" /></>,
  walk: <><circle cx="13.5" cy="4.5" r="1.8" /><path d="M13 8.5 10 13l2 3v5M13 8.5l3 2.5 2.5 1M13 8.5l-1 5 4 2.5 1 4.5" /></>,
  bus: <><rect x="4" y="4" width="16" height="13" rx="2.5" /><path d="M4 11h16M7 21v-4M17 21v-4" /><circle cx="8" cy="14.5" r=".8" /><circle cx="16" cy="14.5" r=".8" /></>,
  cycle: <><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5 9 9h6l3.5 7.5M12 6.5h2.5" /></>,
  bed: <><path d="M3 18v-8M3 14h18v4M6 14V9.5h9L18 14" /><circle cx="6.5" cy="7.5" r="1.5" /></>,
  wifi: <><path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0" /><circle cx="12" cy="19" r="1.2" /></>,
  food: <><path d="M7 3v8M4 3v4a3 3 0 0 0 6 0V3M7 11v10M16 3c-2 1.5-3 4-3 7v3h3v8M16 3v18" /></>,
  bath: <><path d="M4 13h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2ZM6 13V6a2 2 0 0 1 4 0" /><path d="M8 20l-1 1.5M16 20l1 1.5" /></>,
  ac: <><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><circle cx="12" cy="12" r="1.6" /></>,
  park: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M10 17V7h3a3 3 0 0 1 0 6h-3" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  chat: <path d="M4 5.5h16v11H9l-5 4v-15Z" />,
  phone: <path d="M7 3.5h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 5 5.5a2 2 0 0 1 2-2Z" />,
  google: <><path d="M21.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.8-4.4 2.8-7.6Z" /><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.3-2.6c-.9.6-2 1-3.3 1-2.6 0-4.8-1.7-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z" /><path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z" /><path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4A10 10 0 0 0 3 7.4l3.4 2.7C7.2 7.7 9.4 6 12 6Z" /></>,
  chevR: <path d="m9 5 7 7-7 7" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></>,
  grad: <><path d="m12 4 10 5-10 5L2 9l10-5Z" /><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5M22 9v6" /></>,
  brief: <><rect x="3.5" y="7.5" width="17" height="13" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  logout: <><path d="M14 4H6v16h8M10 12h11M18 8.5 21.5 12 18 15.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></>,
};

export default function Icon({
  name,
  size = 20,
  className = "",
  filled = false,
}: {
  name: keyof typeof paths;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}
