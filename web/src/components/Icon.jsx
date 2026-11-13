// Conjunto enxuto de ícones SVG inline para substituir glifos Unicode/emojis com nitidez uniforme.
export default function Icon({ name, size = 16, className = '', title }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `inline-block shrink-0 ${className}`,
    'aria-hidden': title ? undefined : true,
    role: title ? 'img' : undefined,
  };

  let paths = null;
  switch (name) {
    case 'board':
      paths = (
        <>
          <rect x="2" y="2.5" width="3.3" height="11" rx="0.8" />
          <rect x="6.35" y="2.5" width="3.3" height="7.5" rx="0.8" />
          <rect x="10.7" y="2.5" width="3.3" height="9.5" rx="0.8" />
        </>
      );
      break;
    case 'backlog':
      paths = (
        <>
          <path d="M2.5 4h11M2.5 8h11M2.5 12h7.5" />
        </>
      );
      break;
    case 'issues':
      paths = (
        <>
          <circle cx="3.2" cy="4" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="3.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="3.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <path d="M6 4h7.5M6 8h7.5M6 12h7.5" />
        </>
      );
      break;
    case 'flag':
      paths = <path d="M3.5 13.5V2.8m0 0h8l-1.8 2.8L11.5 8.5h-8" />;
      break;
    case 'check-circle':
      paths = (
        <>
          <circle cx="8" cy="8" r="5.8" />
          <path d="M5.5 8.2l1.8 1.8 3.4-3.7" />
        </>
      );
      break;
    case 'check':
      paths = <path d="M3 8.5l3.2 3.2L13 4.5" />;
      break;
    case 'plus':
      paths = <path d="M8 3v10M3 8h10" />;
      break;
    case 'search':
      paths = (
        <>
          <circle cx="7.2" cy="7.2" r="4.5" />
          <path d="M10.6 10.6L13.8 13.8" />
        </>
      );
      break;
    case 'refresh':
      paths = (
        <>
          <path d="M13.2 8a5.2 5.2 0 1 1-1.3-3.4" />
          <path d="M13.2 2.6v2.6h-2.6" />
        </>
      );
      break;
    case 'link':
      paths = (
        <>
          <path d="M6.8 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1.1 1.1" />
          <path d="M9.2 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1.1-1.1" />
        </>
      );
      break;
    case 'copy':
      paths = (
        <>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
          <path d="M10.5 5.5V3.7A1.2 1.2 0 0 0 9.3 2.5H3.7A1.2 1.2 0 0 0 2.5 3.7v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" />
        </>
      );
      break;
    case 'close':
      paths = <path d="M4 4l8 8M12 4l-8 8" />;
      break;
    case 'chevron-down':
      paths = <path d="M4.2 6.2L8 10l3.8-3.8" />;
      break;
    case 'chevron-up':
      paths = <path d="M4.2 9.8L8 6l3.8 3.8" />;
      break;
    case 'chevron-right':
      paths = <path d="M6.2 4.2L10 8l-3.8 3.8" />;
      break;
    case 'chevron-left':
      paths = <path d="M9.8 4.2L6 8l3.8 3.8" />;
      break;
    case 'external-link':
      paths = (
        <>
          <path d="M9.5 2.5h4v4" />
          <path d="M13.5 2.5L7.5 8.5" />
          <path d="M12.5 9.5v3a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3" />
        </>
      );
      break;
    case 'sidebar':
      paths = (
        <>
          <rect x="2" y="2.5" width="12" height="11" rx="1.4" />
          <path d="M6 2.5v11" />
        </>
      );
      break;
    case 'menu':
      paths = <path d="M2.5 4.2h11M2.5 8h11M2.5 11.8h11" />;
      break;
    case 'grip':
      paths = (
        <>
          <circle cx="6" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="6" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
        </>
      );
      break;
    case 'sun':
      paths = (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" />
        </>
      );
      break;
    case 'moon':
      paths = <path d="M13.2 9.8A5.5 5.5 0 0 1 6.2 2.8a5.5 5.5 0 1 0 7 7Z" />;
      break;
    case 'monitor':
      paths = (
        <>
          <rect x="2" y="2.8" width="12" height="8.2" rx="1.2" />
          <path d="M5.5 13.5h5M8 11v2.5" />
        </>
      );
      break;
    case 'palette':
      paths = (
        <>
          <path d="M8 2.2a5.8 5.8 0 1 0 0 11.6c.8 0 1.4-.6 1.4-1.4 0-.37-.14-.7-.37-.96-.22-.25-.36-.58-.36-.95 0-.8.65-1.45 1.45-1.45h1.68A2.2 2.2 0 0 0 14 6.84C14 4.28 11.31 2.2 8 2.2Z" />
          <circle cx="5.6" cy="6.6" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="8" cy="5.1" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="10.4" cy="6.6" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="5.5" cy="9.4" r="0.75" fill="currentColor" stroke="none" />
        </>
      );
      break;
    case 'warning':
      paths = (
        <>
          <path d="M8 2.4l5.8 10.4H2.2L8 2.4Z" />
          <path d="M8 6.5v3M8 11.3h.01" />
        </>
      );
      break;
    case 'info':
      paths = (
        <>
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 7.4v3.4M8 5.1h.01" />
        </>
      );
      break;
    case 'filter-off':
      paths = (
        <>
          <path d="M2.5 3.5h11l-4.2 4.8v3.7l-2.6 1.3V8.3L2.5 3.5Z" />
          <path d="M2.5 13.5L13.5 2.5" />
        </>
      );
      break;
    case 'inbox':
      paths = (
        <>
          <path d="M2.5 9.5l1.6-6h7.8l1.6 6v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V9.5Z" />
          <path d="M2.5 9.5h3.2l1 1.5h2.6l1-1.5h3.2" />
        </>
      );
      break;
    case 'keyboard':
      paths = (
        <>
          <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.3" />
          <path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M11.5 6.5h.01M4.5 9.5h7" />
        </>
      );
      break;
    case 'eye':
      paths = (
        <>
          <path d="M1.6 8s2.3-4.2 6.4-4.2S14.4 8 14.4 8s-2.3 4.2-6.4 4.2S1.6 8 1.6 8Z" />
          <circle cx="8" cy="8" r="1.9" />
        </>
      );
      break;
    case 'eye-off':
      paths = (
        <>
          <path d="M2.2 2.2l11.6 11.6" />
          <path d="M6.5 4.1A6.6 6.6 0 0 1 8 3.8c4.1 0 6.4 4.2 6.4 4.2a11 11 0 0 1-2.2 2.8M9.9 11.8A6.5 6.5 0 0 1 8 12.2C3.9 12.2 1.6 8 1.6 8a11.2 11.2 0 0 1 2.7-3.2" />
        </>
      );
      break;
    case 'lock':
      paths = (
        <>
          <rect x="3.2" y="7.2" width="9.6" height="6.5" rx="1.3" />
          <path d="M5.2 7.2V5.1a2.8 2.8 0 0 1 5.6 0v2.1" />
        </>
      );
      break;
    case 'key':
      paths = (
        <>
          <circle cx="5.5" cy="9.5" r="3" />
          <path d="M7.8 7.2L13.5 2.5M11.2 4.4l2 1.8M13.2 2.8l1.3 1.2" />
        </>
      );
      break;
    case 'logout':
      paths = (
        <>
          <path d="M6.2 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2.7" />
          <path d="M10.5 5.2L13.5 8l-3 2.8M6.2 8h7.1" />
        </>
      );
      break;
    case 'edit':
      paths = <path d="M10.8 2.6l2.6 2.6L5.6 13H3v-2.6l7.8-7.8Z" />;
      break;
    case 'priority-1':
      paths = (
        <>
          <path d="M4 9.5L8 5.5l4 4" />
          <path d="M4 12.5L8 8.5l4 4" />
        </>
      );
      break;
    case 'priority-2':
      paths = <path d="M4 10L8 6l4 4" />;
      break;
    case 'priority-3':
      paths = <path d="M3.5 6.5h9M3.5 9.5h9" />;
      break;
    case 'priority-4':
      paths = <path d="M4 6l4 4 4-4" />;
      break;
    default:
      return null;
  }

  return (
    <svg {...common}>
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
}
