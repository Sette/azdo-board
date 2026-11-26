import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { prefs } from '../lib/format.js';
import { useItemParam, useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { toSafeHtml } from '../lib/rich.js';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';
import TypeIcon from './TypeIcon.jsx';

const CopilotContext = createContext(null);
const LIST_QUERY_KEYS = [['sprint'], ['backlog'], ['my'], ['search'], ['blocked'], ['validation']];

// Transforma referências `#1234` fora de blocos de código/links em links internos clicáveis para abrir o ItemModal.
function linkifyWorkItemIds(markdown) {
  const lines = String(markdown || '').split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/(^|[\s([>:])#(\d{1,8})\b/g, '$1[#$2](?azdo-item=$2)');
    })
    .join('\n');
}

export function AgentCopilotProvider({ children }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const [params] = useSearchParams();
  const { itemId, open: openItem } = useItemParam();
  const { data: meta } = useMeta();

  const { data: agentsMeta } = useQuery({
    queryKey: ['agentsMeta'],
    queryFn: api.agentsMeta,
    staleTime: 60_000,
    retry: false,
  });

  const enabled = Boolean(agentsMeta?.enabled);
  const providers = agentsMeta?.providers || [];
  const skills = agentsMeta?.skills || [];

  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProviderState] = useState(() => prefs.get('copilotProvider', 'claude'));
  const [sessionByProvider, setSessionByProvider] = useState({});
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachItem, setAttachItem] = useState(true);
  const [streaming, setStreaming] = useState(null); // { runId, provider }
  const abortRef = useRef(null);

  // Seleciona automaticamente o primeiro CLI instalado caso o salvo não esteja disponível.
  useEffect(() => {
    if (!providers.length) return;
    const current = providers.find((p) => p.id === provider);
    if (!current?.installed) {
      const firstInstalled = providers.find((p) => p.installed);
      if (firstInstalled) {
        setProviderState(firstInstalled.id);
        prefs.set('copilotProvider', firstInstalled.id);
      }
    }
  }, [providers, provider]);

  useEffect(() => {
    setAttachItem(true);
  }, [itemId]);

  const setProvider = useCallback((nextId) => {
    setProviderState(nextId);
    prefs.set('copilotProvider', nextId);
  }, []);

  const openItemDetail = itemId ? qc.getQueryData(['item', String(itemId)]) : null;

  const currentSprint = useMemo(() => {
    const sprintId = params.get('sprint') || meta?.currentSprintId;
    return meta?.sprints?.find((s) => s.id === sprintId) || null;
  }, [params, meta]);

  const buildScreenContext = useCallback(() => {
    const ctx = {
      page: location.pathname,
      sprintId: currentSprint?.id || null,
      sprintName: currentSprint?.name || null,
      sprintPath: currentSprint?.path || null,
    };
    if (itemId && attachItem) {
      if (openItemDetail) {
        ctx.item = {
          id: openItemDetail.id,
          type: openItemDetail.type,
          title: openItemDetail.title,
          state: openItemDetail.state,
          sprint: openItemDetail.sprint,
          iterationPath: openItemDetail.iterationPath,
          assignee: openItemDetail.assignee?.email || openItemDetail.assignee?.name || null,
          parentId: openItemDetail.parent?.id || openItemDetail.parentId || null,
          tags: openItemDetail.tags || [],
        };
      } else {
        ctx.item = { id: Number(itemId) || itemId };
      }
    }
    return ctx;
  }, [location.pathname, currentSprint, itemId, attachItem, openItemDetail]);

  const refreshBoardData = useCallback(
    (silent = false) => {
      for (const k of LIST_QUERY_KEYS) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ['item'] });
      toast.info(t(silent ? 'copilotBoardSynced' : 'copilotManualSynced'));
    },
    [qc, toast, t],
  );

  const stop = useCallback(() => {
    const curRunId = streaming?.runId;
    abortRef.current?.abort();
    abortRef.current = null;
    if (curRunId) api.stopAgent(curRunId).catch(() => {});
  }, [streaming]);

  const clearChat = useCallback(() => {
    if (streaming) stop();
    setMessages([]);
    setSessionByProvider((prev) => ({ ...prev, [provider]: null }));
  }, [streaming, stop, provider]);

  const sendMessage = useCallback(
    async (overridePrompt, overrideProvider) => {
      const text = String(overridePrompt ?? draft).trim();
      if (!text || streaming) return;
      const activeProvider = overrideProvider || provider;
      if (overrideProvider && overrideProvider !== provider) setProvider(overrideProvider);
      if (overridePrompt === undefined) setDraft('');

      const userMsgId = `u-${Date.now()}`;
      const asstMsgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const contextSnapshot = buildScreenContext();

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text, itemContext: contextSnapshot.item || null },
        { id: asstMsgId, role: 'assistant', provider: activeProvider, text: '', tools: [], pending: true, error: null },
      ]);

      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming({ runId: null, provider: activeProvider });

      let didMutate = false;
      try {
        await api.streamAgentChat({
          provider: activeProvider,
          sessionId: sessionByProvider[activeProvider] || undefined,
          prompt: text,
          context: contextSnapshot,
          signal: ac.signal,
          onEvent: (ev) => {
            if (ev.type === 'init') {
              setStreaming({ runId: ev.runId, provider: activeProvider });
              if (ev.sessionId) {
                setSessionByProvider((prev) => ({ ...prev, [activeProvider]: ev.sessionId }));
              }
            } else if (ev.type === 'delta' && ev.text) {
              setMessages((prev) =>
                prev.map((m) => (m.id === asstMsgId ? { ...m, text: m.text + ev.text } : m)),
              );
            } else if (ev.type === 'tool' && ev.name) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstMsgId
                    ? { ...m, tools: m.tools.includes(ev.name) ? m.tools : [...m.tools, ev.name] }
                    : m,
                ),
              );
            } else if (ev.type === 'error' && ev.message) {
              setMessages((prev) =>
                prev.map((m) => (m.id === asstMsgId ? { ...m, error: ev.message } : m)),
              );
            } else if (ev.type === 'done') {
              if (ev.sessionId) {
                setSessionByProvider((prev) => ({ ...prev, [activeProvider]: ev.sessionId }));
              }
              if (ev.mutated) didMutate = true;
            }
          },
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId
                ? { ...m, text: m.text || `_${t('copilotStopped')}_`, pending: false }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === asstMsgId ? { ...m, error: err.message, pending: false } : m)),
          );
        }
      } finally {
        abortRef.current = null;
        setStreaming(null);
        setMessages((prev) => prev.map((m) => (m.id === asstMsgId ? { ...m, pending: false } : m)));
        if (didMutate) refreshBoardData(true);
      }
    },
    [draft, streaming, provider, setProvider, buildScreenContext, sessionByProvider, t, refreshBoardData],
  );

  const launchPrompt = useCallback(
    ({ prompt, autoSend = false }) => {
      setIsOpen(true);
      if (autoSend && prompt) {
        setTimeout(() => {
          sendMessage(prompt);
        }, 0);
      } else if (prompt !== undefined) {
        setDraft(prompt);
      }
    },
    [sendMessage],
  );

  const value = useMemo(
    () => ({
      enabled,
      providers,
      skills,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      provider,
      setProvider,
      messages,
      draft,
      setDraft,
      attachItem,
      setAttachItem,
      streaming,
      sendMessage,
      stop,
      clearChat,
      refreshBoardData,
      launchPrompt,
      openItem,
      currentSprint,
      itemId,
      openItemDetail,
    }),
    [
      enabled,
      providers,
      skills,
      isOpen,
      provider,
      setProvider,
      messages,
      draft,
      attachItem,
      streaming,
      sendMessage,
      stop,
      clearChat,
      refreshBoardData,
      launchPrompt,
      openItem,
      currentSprint,
      itemId,
      openItemDetail,
    ],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export const useCopilot = () => useContext(CopilotContext);

export function CopilotTopBarButton() {
  const copilot = useCopilot();
  const { t } = useI18n();
  if (!copilot?.enabled) return null;

  const busy = Boolean(copilot.streaming);
  return (
    <button
      type="button"
      onClick={copilot.toggle}
      aria-pressed={copilot.isOpen}
      title={`${t('copilotTitle')} (A)`}
      className={`relative inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        copilot.isOpen
          ? 'bg-brand text-white shadow-sm hover:bg-brand-hover'
          : 'bg-column text-ink hover:bg-hover'
      }`}
    >
      <Icon name="sparkles" size={14} className={copilot.isOpen ? 'text-white' : 'text-brand-ink'} />
      <span className="hidden md:inline">{t('copilotBtn')}</span>
      {busy && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-success-solid ring-2 ring-surface" />
      )}
    </button>
  );
}

export function ItemCopilotMenu({ item }) {
  const copilot = useCopilot();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!copilot?.enabled || !item?.id) return null;

  const hasSkill = (name) => copilot.skills.some((s) => s.name === name);
  const isPbiOrBug = item.type === 'Product Backlog Item' || item.type === 'User Story' || item.type === 'Bug';
  const actions = [];

  if (isPbiOrBug && hasSkill('azdevops-create-pbi')) {
    actions.push({
      key: 'plan-tasks',
      label: t('copilotSkillPlanTasks', { id: item.id }),
      prompt: `/azdevops-create-pbi tasks ${item.id}`,
      autoSend: true,
    });
  }
  if (hasSkill('azdevops-generate-item-description')) {
    actions.push({
      key: 'gen-desc',
      label: t('copilotSkillGenDesc'),
      prompt: `/azdevops-generate-item-description update ${item.id}`,
      autoSend: true,
    });
  }
  if (isPbiOrBug && hasSkill('azdevops-generate-tasks')) {
    actions.push({
      key: 'git-tasks',
      label: t('copilotSkillTasksGit'),
      prompt: `/azdevops-generate-tasks ${item.id}`,
      autoSend: true,
    });
  }
  if (hasSkill('azdevops-summarize-discussions')) {
    actions.push({
      key: 'sum-disc',
      label: t('copilotSkillSummarize'),
      prompt: `/azdevops-summarize-discussions ${item.id}`,
      autoSend: true,
    });
  }
  if (isPbiOrBug && hasSkill('azdevops-finish-pbi')) {
    actions.push({
      key: 'finish-pbi',
      label: t('copilotSkillFinishPbi', { id: item.id }),
      prompt: `/azdevops-finish-pbi ${item.id}`,
      autoSend: true,
    });
  }
  actions.push({
    key: 'ask',
    label: t('copilotAskAboutItem', { id: item.id }),
    prompt: `#${item.id} `,
    autoSend: false,
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-[3px] bg-brand-subtle px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-brand hover:text-white"
        title={t('copilotTitle')}
      >
        <Icon name="sparkles" size={13} />
        <span>{t('copilotAskItem')}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-md border border-line bg-surface-overlay py-1.5 text-xs shadow-xl">
          {actions.map((act) => (
            <button
              key={act.key}
              type="button"
              onClick={() => {
                setOpen(false);
                copilot.setAttachItem(true);
                copilot.launchPrompt({ prompt: act.prompt, autoSend: act.autoSend });
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-ink hover:bg-hover"
            >
              <Icon name={act.autoSend ? 'terminal' : 'sparkles'} size={13} className="text-brand-ink" />
              <span className="truncate">{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentCopilotDrawer() {
  const copilot = useCopilot();
  const { t } = useI18n();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [activeSkillIdx, setActiveSkillIdx] = useState(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const skillsPopoverRef = useRef(null);

  const slashQuery = useMemo(() => {
    const m = copilot?.draft?.match(/^\/([a-zA-Z0-9._-]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [copilot?.draft]);

  const showSlashMenu = skillsOpen || slashQuery !== null;

  const filteredSkills = useMemo(() => {
    if (!copilot?.skills) return [];
    const term = (skillsOpen ? skillFilter : slashQuery || '').trim().toLowerCase();
    if (!term) return copilot.skills;
    return copilot.skills.filter(
      (s) => s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term),
    );
  }, [copilot?.skills, skillsOpen, skillFilter, slashQuery]);

  useEffect(() => {
    setActiveSkillIdx(0);
  }, [filteredSkills.length, showSlashMenu]);

  useEffect(() => {
    if (copilot?.isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [copilot?.isOpen]);

  useEffect(() => {
    if (!copilot?.isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !skillsOpen && slashQuery === null) {
        if (!document.querySelector('[data-command-palette], [data-shortcuts-modal], [data-create-modal], [data-required-dialog]')) {
          e.stopPropagation();
          copilot.close();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [copilot, skillsOpen, slashQuery]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [copilot?.messages]);

  useEffect(() => {
    if (!skillsOpen) return undefined;
    const onDoc = (e) => {
      if (skillsPopoverRef.current && !skillsPopoverRef.current.contains(e.target)) {
        setSkillsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [skillsOpen]);

  if (!copilot?.enabled || !copilot.isOpen) return null;

  const pickSkill = (skill) => {
    const suffix = copilot.itemId && copilot.attachItem && /^azdevops-(create-pbi|finish-pbi|generate-tasks|summarize-discussions|generate-item-description)$/.test(skill.name)
      ? skill.name === 'azdevops-create-pbi'
        ? ` tasks ${copilot.itemId}`
        : skill.name === 'azdevops-generate-item-description'
          ? ` update ${copilot.itemId}`
          : ` ${copilot.itemId}`
      : ' ';
    copilot.setDraft(`/${skill.name}${suffix}`);
    setSkillsOpen(false);
    setSkillFilter('');
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const activeSpec = copilot.providers.find((p) => p.id === copilot.provider);
  const azdoSkills = filteredSkills.filter((s) => s.category === 'azdevops');
  const otherSkills = filteredSkills.filter((s) => s.category !== 'azdevops');

  const quickSuggestions = copilot.skills
    .filter((s) => s.category === 'azdevops')
    .slice(0, 6);

  const onMessageClick = (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const m = href.match(/^\?azdo-item=(\d+)$/);
    if (m) {
      e.preventDefault();
      copilot.openItem(m[1]);
    }
  };

  return (
    <aside
      data-copilot-drawer="true"
      aria-label={t('copilotTitle')}
      className="fixed inset-y-0 right-0 z-[52] flex w-full max-w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[460px]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-sunken px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand text-white">
            <Icon name="sparkles" size={14} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{t('copilotTitle')}</div>
            <div className="truncate text-[11px] text-ink-muted">{t('copilotSubtitle')}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => copilot.refreshBoardData(false)}
            title={t('copilotSyncBoard')}
            aria-label={t('copilotSyncBoard')}
            className="rounded p-1.5 text-ink-subtle hover:bg-hover hover:text-ink"
          >
            <Icon name="refresh" size={14} />
          </button>
          <button
            type="button"
            onClick={copilot.clearChat}
            title={t('copilotNewChat')}
            aria-label={t('copilotNewChat')}
            className="rounded p-1.5 text-ink-subtle hover:bg-hover hover:text-ink"
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            onClick={copilot.close}
            title={`${t('close')} (Esc)`}
            aria-label={t('close')}
            className="rounded p-1.5 text-ink-subtle hover:bg-hover hover:text-ink"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>

      {/* CLI Provider Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2">
        <div className="grid flex-1 grid-cols-4 gap-1 rounded-[4px] bg-column p-0.5 text-xs" role="tablist">
          {copilot.providers.map((p) => {
            const active = p.id === copilot.provider;
            const disabled = !p.installed || Boolean(copilot.streaming);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => copilot.setProvider(p.id)}
                title={p.installed ? `${p.label}${p.version ? ` · ${p.version}` : ''}` : t('copilotNotInstalled', { name: p.label })}
                className={`truncate rounded-[3px] px-2 py-1 font-semibold transition-colors ${
                  active
                    ? 'bg-surface text-brand-ink shadow-sm'
                    : p.installed
                      ? 'text-ink-muted hover:text-ink'
                      : 'cursor-not-allowed opacity-40'
                }`}
              >
                {p.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Pills */}
      {(copilot.currentSprint || copilot.itemId) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-sunken/60 px-3.5 py-1.5 text-[11px]">
          {copilot.currentSprint && (
            <span className="inline-flex items-center gap-1 rounded bg-column px-2 py-0.5 font-medium text-ink-subtle">
              <Icon name="board" size={11} />
              <span className="max-w-36 truncate">{copilot.currentSprint.name}</span>
            </span>
          )}
          {copilot.itemId && (
            <button
              type="button"
              onClick={() => copilot.setAttachItem((v) => !v)}
              title={t(copilot.attachItem ? 'copilotCtxAttach' : 'copilotCtxDetached', { id: copilot.itemId })}
              className={`inline-flex max-w-64 items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                copilot.attachItem
                  ? 'bg-brand-subtle text-brand-ink'
                  : 'bg-column text-ink-muted line-through opacity-70'
              }`}
            >
              {copilot.openItemDetail?.type && <TypeIcon type={copilot.openItemDetail.type} size={11} />}
              <span className="truncate">
                #{copilot.itemId} {copilot.openItemDetail?.title || ''}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div ref={scrollRef} onClick={onMessageClick} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {copilot.messages.length === 0 ? (
          <div className="space-y-4 py-4">
            <div className="rounded-md border border-line bg-sunken p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon name="terminal" size={15} className="text-brand-ink" />
                <span>{t('copilotEmptyTitle')}</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-subtle">{t('copilotEmptyHint')}</p>
            </div>

            {quickSuggestions.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                  {t('copilotQuickPrompts')}
                </div>
                <div className="space-y-1.5">
                  {quickSuggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => pickSkill(s)}
                      className="flex w-full flex-col rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand hover:bg-sunken"
                    >
                      <span className="font-mono text-xs font-semibold text-brand-ink">/{s.name}</span>
                      {s.description && (
                        <span className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{s.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          copilot.messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex flex-col items-end">
                  <div className="max-w-[88%] rounded-lg bg-brand px-3.5 py-2 text-sm whitespace-pre-wrap text-white shadow-xs">
                    {m.text}
                  </div>
                  {m.itemContext?.id && (
                    <span className="mt-1 text-[10px] text-ink-muted">#{m.itemContext.id}</span>
                  )}
                </div>
              );
            }

            const pLabel = copilot.providers.find((p) => p.id === m.provider)?.shortLabel || m.provider;
            const html = m.text ? toSafeHtml(linkifyWorkItemIds(m.text), 'markdown') : '';
            return (
              <div key={m.id} className="flex flex-col items-start">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
                  <Icon name="terminal" size={12} className="text-brand-ink" />
                  <span>{pLabel}</span>
                  {m.pending && (
                    <span className="inline-flex items-center gap-1 text-brand-ink">
                      · <span className="animate-pulse">{t('copilotRunning', { cli: pLabel })}</span>
                    </span>
                  )}
                </div>

                {m.tools?.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {m.tools.map((toolName) => (
                      <span
                        key={toolName}
                        className="inline-flex items-center gap-1 rounded border border-line bg-column px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle"
                      >
                        ⚙ {toolName}
                      </span>
                    ))}
                  </div>
                )}

                <div className="w-full rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-sm text-ink">
                  {html ? (
                    <div className="prose-azdo text-sm break-words" dangerouslySetInnerHTML={{ __html: html }} />
                  ) : m.pending ? (
                    <div className="flex items-center gap-1.5 py-1 text-xs text-ink-muted">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:240ms]" />
                    </div>
                  ) : null}

                  {m.error && (
                    <div className="mt-2 rounded bg-danger-bg px-2.5 py-1.5 text-xs text-danger-ink">
                      {m.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input & Slash Skills Menu */}
      <div ref={skillsPopoverRef} className="relative shrink-0 border-t border-line bg-surface p-3">
        {showSlashMenu && (
          <div className="absolute right-3 bottom-full left-3 z-20 mb-2 flex max-h-72 flex-col overflow-hidden rounded-md border border-line bg-surface-overlay shadow-2xl">
            {skillsOpen && (
              <div className="border-b border-line px-3 py-2">
                <input
                  autoFocus
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setSkillsOpen(false);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSkillIdx((i) => (filteredSkills.length ? (i + 1) % filteredSkills.length : 0));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSkillIdx((i) => (filteredSkills.length ? (i - 1 + filteredSkills.length) % filteredSkills.length : 0));
                    } else if (e.key === 'Enter' && filteredSkills[activeSkillIdx]) {
                      e.preventDefault();
                      pickSkill(filteredSkills[activeSkillIdx]);
                    }
                  }}
                  placeholder={t('copilotSkillsSearch')}
                  className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
                />
              </div>
            )}
            <div className="overflow-y-auto py-1">
              {azdoSkills.length > 0 && (
                <>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold tracking-wide text-ink-muted uppercase">
                    {t('copilotSkillsAzdo')}
                  </div>
                  {azdoSkills.map((s) => {
                    const idx = filteredSkills.indexOf(s);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onMouseEnter={() => setActiveSkillIdx(idx)}
                        onClick={() => pickSkill(s)}
                        className={`flex w-full flex-col px-3 py-1.5 text-left text-xs ${
                          idx === activeSkillIdx ? 'bg-brand-subtle text-brand-ink' : 'text-ink hover:bg-hover'
                        }`}
                      >
                        <span className="font-mono font-semibold">/{s.name}</span>
                        {s.description && <span className="line-clamp-1 text-[11px] text-ink-muted">{s.description}</span>}
                      </button>
                    );
                  })}
                </>
              )}
              {otherSkills.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-ink-muted uppercase">
                    {t('copilotSkillsOther')}
                  </div>
                  {otherSkills.map((s) => {
                    const idx = filteredSkills.indexOf(s);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onMouseEnter={() => setActiveSkillIdx(idx)}
                        onClick={() => pickSkill(s)}
                        className={`flex w-full flex-col px-3 py-1.5 text-left text-xs ${
                          idx === activeSkillIdx ? 'bg-brand-subtle text-brand-ink' : 'text-ink hover:bg-hover'
                        }`}
                      >
                        <span className="font-mono font-semibold">/{s.name}</span>
                        {s.description && <span className="line-clamp-1 text-[11px] text-ink-muted">{s.description}</span>}
                      </button>
                    );
                  })}
                </>
              )}
              {filteredSkills.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-ink-muted">{t('copilotNoSkills')}</div>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            copilot.sendMessage();
          }}
          className="space-y-2"
        >
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(2, copilot.draft.split('\n').length))}
            value={copilot.draft}
            onChange={(e) => copilot.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (slashQuery !== null && filteredSkills.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveSkillIdx((i) => (i + 1) % filteredSkills.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveSkillIdx((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
                  return;
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  pickSkill(filteredSkills[activeSkillIdx]);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                copilot.sendMessage();
              }
            }}
            placeholder={t('copilotPlaceholder')}
            className="w-full resize-none rounded-md border-2 border-line bg-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:bg-surface"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSkillsOpen((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-mono text-xs font-semibold ${
                  skillsOpen ? 'bg-brand text-white' : 'bg-column text-ink-subtle hover:bg-hover hover:text-ink'
                }`}
              >
                {t('copilotSkillsBtn')}
              </button>
              {activeSpec?.version && (
                <span className="hidden max-w-44 truncate text-[11px] text-ink-muted sm:inline" title={activeSpec.version}>
                  {activeSpec.shortLabel}
                </span>
              )}
            </div>

            {copilot.streaming ? (
              <button
                type="button"
                onClick={copilot.stop}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-danger-solid px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <Icon name="stop" size={13} />
                <span>{t('copilotStop')}</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!copilot.draft.trim() || !activeSpec?.installed}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                <Icon name="send" size={13} />
                <span>{t('copilotSend')}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </aside>
  );
}
