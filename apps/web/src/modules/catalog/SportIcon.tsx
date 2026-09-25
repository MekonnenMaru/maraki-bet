export function SportIcon({ name }: { name: string }) {
  const key = name.toLowerCase();
  return (
    <svg className="sport-ico" viewBox="0 0 24 24" aria-hidden="true">
      {key.includes("soccer") || key.includes("futsal") ? (
        <circle cx="12" cy="12" r="8" />
      ) : key.includes("basket") ? (
        <path d="M5 12c0-4 3-7 7-7s7 3 7 7-3 7-7 7-7-3-7-7zm0 0h14M12 5c2 2.4 3 4.6 3 7s-1 4.6-3 7c-2-2.4-3-4.6-3-7s1-4.6 3-7z" />
      ) : key.includes("water") ? (
        <path d="M4 15c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M4 19c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M8 10c1.2-3 7.2-3 8 0" />
      ) : key.includes("volley") ? (
        <path d="M12 4a8 8 0 100 16 8 8 0 000-16zm-6 6c3-1 7-1 12 0M6 14c3 1 7 1 12 0" />
      ) : key.includes("table") ? (
        <path d="M4 8h16v8H4zM12 8v8M4 12h16" />
      ) : key.includes("rugby") ? (
        <ellipse cx="12" cy="12" rx="8" ry="5" />
      ) : key.includes("hockey") ? (
        <path d="M5 18l6-11 3 5 5-2M5 18h4" />
      ) : key.includes("hand") ? (
        <path d="M8 20V9m3 11V6m3 14V8m3 12v-7" />
      ) : key.includes("floor") ? (
        <path d="M4 17h16M7 17V8l5-3 5 3v9" />
      ) : key.includes("dart") ? (
        <path d="M14 4l6 6-9 9-7 1 1-7z" />
      ) : key.includes("cricket") ? (
        <path d="M7 20V6m0 0l3 3M16 5l3 3-8 12" />
      ) : key.includes("box") ? (
        <path d="M5 11h6v6H5zM13 9h6v8h-6z" />
      ) : key.includes("base") ? (
        <path d="M5 19l14-14M6 9a7 7 0 009 9M18 15a7 7 0 00-9-9" />
      ) : key.includes("american") ? (
        <path d="M4 12c2-5 14-5 16 0-2 5-14 5-16 0zm8-5v10M7 10l10 4M7 14l10-4" />
      ) : (
        <circle cx="12" cy="12" r="7" />
      )}
    </svg>
  );
}
