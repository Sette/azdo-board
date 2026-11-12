import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from './i18n.jsx';

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 10 * 60_000 });
export const usePeople = () => useQuery({ queryKey: ['people'], queryFn: api.people, staleTime: 30 * 60_000 });
export const useParents = (type, enabled = true) =>
  useQuery({ queryKey: ['parents', type], queryFn: () => api.parents(type), enabled: !!type && enabled, staleTime: 5 * 60_000 });

// Abre/fecha o detalhe do item via ?item=<id>, em qualquer página.
export function useItemParam() {
  const [params, setParams] = useSearchParams();
  const itemId = params.get('item');
  const open = (id) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('item', String(id));
      return n;
    });
  const close = () =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('item');
      return n;
    });
  return { itemId, open, close };
}

const LIST_KEYS = [['sprint'], ['backlog'], ['my'], ['search'], ['blocked'], ['validation']];

// Escritas no mesmo item vão em fila e usam o rev mais recente que já vimos,
// para que edições seguidas (título, depois tag) não conflitem entre si.
const chains = new Map();
const latestRev = new Map();
function queuedUpdate(id, changes) {
  const run = () => {
    const rev = Math.max(changes.rev ?? 0, latestRev.get(id) ?? 0) || undefined;
    return api.update(id, { ...changes, rev }).then((detail) => {
      latestRev.set(id, detail.rev);
      return detail;
    });
  };
  const next = (chains.get(id) || Promise.resolve()).catch(() => {}).then(run);
  chains.set(id, next);
  return next;
}

function patchLists(qc, id, optimistic) {
  for (const k of LIST_KEYS) {
    for (const [key, data] of qc.getQueriesData({ queryKey: k })) {
      if (Array.isArray(data)) qc.setQueryData(key, data.map((it) => (it.id === id ? { ...it, ...optimistic } : it)));
    }
  }
}

// Atualiza um item: otimista nas listas em cache, PATCH com rev, rollback/refetch no erro.
export function useUpdateItem() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ id, changes }) => queuedUpdate(id, changes),
    onMutate: async ({ id, changes, optimistic }) => {
      if (!optimistic) return {};
      // Patch synchronously so the card lands in its new column on drop, then again
      // after cancelling in-flight refetches (a cancelled fetch may restore old data).
      const snapshots = LIST_KEYS.flatMap((k) => qc.getQueriesData({ queryKey: k }));
      patchLists(qc, id, optimistic);
      await Promise.all(LIST_KEYS.map((k) => qc.cancelQueries({ queryKey: k })));
      patchLists(qc, id, optimistic);
      return { snapshots };
    },
    onError: (err, { id }, ctx) => {
      for (const [key, data] of ctx?.snapshots || []) qc.setQueryData(key, data);
      if (err.status === 422 && err.missingFields) {
        // quem chamou abre o diálogo de campos faltando (SaveItemProvider)
      } else if (err.status === 409) {
        toast.error(t('conflictToast', { id }));
      } else {
        toast.error(t('saveFailed', { id, message: err.message }));
      }
      qc.invalidateQueries({ queryKey: ['item', String(id)] });
      LIST_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onSuccess: (detail) => {
      qc.setQueryData(['item', String(detail.id)], detail);
      const { children, parent, comments, ...flat } = detail;
      for (const k of LIST_KEYS) {
        for (const [key, data] of qc.getQueriesData({ queryKey: k })) {
          if (Array.isArray(data)) qc.setQueryData(key, data.map((it) => (it.id === detail.id ? { ...it, ...flat } : it)));
        }
      }
      if (detail.parentId) qc.invalidateQueries({ queryKey: ['item', String(detail.parentId)] });
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.create,
    onSuccess: (item) => {
      LIST_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (item.parentId) qc.invalidateQueries({ queryKey: ['item', String(item.parentId)] });
    },
  });
}
