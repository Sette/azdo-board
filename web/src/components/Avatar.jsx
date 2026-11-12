import { colorFor, initials } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';

export default function Avatar({ person, size = 24, ring = false }) {
  const { t } = useI18n();
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.4) };
  if (!person) {
    return (
      <span
        title={t('unassigned')}
        style={style}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#dfe1e6] text-ink-muted"
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="5.5" r="3" />
          <path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={person.name}
      style={{ ...style, background: colorFor(person.email || person.name) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${ring ? 'ring-2 ring-white' : ''}`}
    >
      {initials(person.name)}
    </span>
  );
}
