export function Logo() {
  return (
    <span className="logo-lockup">
      <svg className="logo-mark-svg" viewBox="0 0 120 62" aria-hidden="true">
        <path
          className="logo-arch"
          d="M12 56C10 18 28 4 48 20"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          className="logo-arch"
          d="M108 56C110 18 92 4 72 20"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <g transform="translate(60 36)">
          <circle r="13.2" fill="#fff" stroke="#1a1a1a" strokeWidth="1.5" />
          <polygon points="0,-5.4 5.1,-1.8 3.2,4.6 -3.2,4.6 -5.1,-1.8" fill="#1a1a1a" />
          <path
            d="M0-5.4 0-13.2M5.1-1.8 12.4-4.3M-5.1-1.8-12.4-4.3M3.2 4.6 7.6 11.6M-3.2 4.6-7.6 11.6"
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <span className="logo-word">
        <span className="logo-name">Maraki</span>
        <span className="logo-bet">BET.com</span>
      </span>
    </span>
  );
}
