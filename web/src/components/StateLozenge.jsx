import { stateTone } from '../lib/format.js';

export default function StateLozenge({ state, category, className = '' }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase tracking-wide ${stateTone(category)} ${className}`}
    >
      {state}
    </span>
  );
}
