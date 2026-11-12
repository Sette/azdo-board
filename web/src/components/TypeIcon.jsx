// Ícones de tipo no estilo Jira: história verde, bug vermelho, task azul.
const ICONS = {
  'Product Backlog Item': { bg: '#36b37e', path: 'M5 3.5h6v9l-3-2.2-3 2.2z' },
  Bug: { bg: '#e5493a', circle: true },
  Task: { bg: '#4bade8', path: 'M4.5 8.2l2.3 2.3 4.7-4.9', stroke: true },
  Feature: { bg: '#904ee2', path: 'M8 3.5l1.3 2.8 3 .4-2.2 2.1.6 3L8 10.4 5.3 11.8l.6-3L3.7 6.7l3-.4z' },
  Epic: { bg: '#904ee2', path: 'M9 2.5L4.5 9H8l-1 4.5L11.5 7H8z' },
};

export default function TypeIcon({ type, size = 16 }) {
  const icon = ICONS[type] || ICONS.Task;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={type} className="shrink-0">
      <title>{type}</title>
      <rect width="16" height="16" rx="3" fill={icon.bg} />
      {icon.circle ? (
        <circle cx="8" cy="8" r="3.2" fill="white" />
      ) : icon.stroke ? (
        <path d={icon.path} stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={icon.path} fill="white" />
      )}
    </svg>
  );
}
