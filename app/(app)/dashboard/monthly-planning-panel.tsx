"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_PRIORITIES, MAX_PRIORITY_LENGTH, monthCells, monthTitle, parseMonthlyPlan, shiftMonth, validMonth, validPriorities, type MonthlyFeatures, type MonthlyPlan, type MonthlyPriority } from '@/lib/monthly-planning';
import styles from './monthly-planning.module.css';

type MonthState = { plan?: MonthlyPlan; input: string; editId: string | null; loading: boolean; saving: boolean; error: string; saved: boolean; latest?: MonthlyFeatures; pending?: MonthlyPriority[]; reviewing: boolean };
const empty = (): MonthState => ({ input: '', editId: null, loading: false, saving: false, error: '', saved: false, reviewing: false });
const dirty = (state: MonthState) => Boolean(state.input || state.editId || state.pending);

export default function MonthlyPlanningPanel({ open, onClose, anchor, refreshKey, onOpenDraft, mobile, draftIds }: {
  open: boolean; onClose: () => void; anchor: string; refreshKey: string; onOpenDraft: (id: string) => void; mobile: boolean; draftIds: string[];
}) {
  const [month, setMonth] = useState(anchor.slice(0, 7));
  const [states, setStates] = useState<Record<string, MonthState>>({});
  const statesRef = useRef(states); statesRef.current = states;
  const requests = useRef<Record<string, number>>({});
  const saving = useRef(new Set<string>());
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyToken = useRef<string | null>(null);
  const closing = useRef(false);
  const afterClose = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const [day, setDay] = useState<string | null>(null);
  const state = states[month] || empty();
  const update = useCallback((key: string, fn: (state: MonthState) => MonthState) => {
    setStates(current => { const next = { ...current, [key]: fn(current[key] || empty()) }; statesRef.current = next; return next; });
  }, []);
  const load = useCallback(async (key: string) => {
    if (saving.current.has(key)) return;
    const sequence = (requests.current[key] || 0) + 1; requests.current[key] = sequence;
    update(key, current => ({ ...current, loading: true, error: current.latest ? current.error : '' }));
    try {
      const response = await fetch(`/api/monthly-plan?month=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load this month.');
      const plan = parseMonthlyPlan(data, key); if (!plan) throw new Error('Could not load this month.');
      if (requests.current[key] !== sequence || saving.current.has(key)) return;
      update(key, current => {
        const changed = current.plan && current.plan.features.revision !== plan.features.revision && dirty(current);
        return { ...current, plan: changed ? { ...plan, features: current.plan!.features } : plan, loading: false, latest: changed ? plan.features : undefined, error: changed ? 'Changed in another window. Your edits are kept.' : '', saved: current.saved && !changed };
      });
    } catch (error) {
      if (requests.current[key] === sequence) update(key, current => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Could not load this month.' }));
    }
  }, [update]);
  useEffect(() => { if (open) void load(month); }, [open, month, refreshKey, load]);
  useEffect(() => {
    const refresh = () => { if (open && document.visibilityState === 'visible') void load(month); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [open, month, load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (Object.values(statesRef.current).some(item => dirty(item) || item.saving)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const closePanel = useCallback((action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    if (mobile && historyToken.current && window.history.state?.fireovaMonthlyPanel === historyToken.current) {
      afterClose.current = action || null; window.history.back();
    } else { onCloseRef.current(); action?.(); }
  }, [mobile]);
  // Keep this listener mounted while the sheet closes. The dashboard's own
  // popstate handler can render the closed state before transient listeners run.
  useEffect(() => {
    const pop = () => {
      if (historyToken.current && window.history.state?.fireovaMonthlyPanel === historyToken.current) return;
      const action = afterClose.current; afterClose.current = null;
      if (historyToken.current) onCloseRef.current();
      if (action) requestAnimationFrame(action);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    if (!open || !mobile) { closing.current = false; return; }
    closing.current = false;
    const previousHistory = window.history.state;
    const token = typeof previousHistory?.fireovaMonthlyPanel === 'string' ? previousHistory.fireovaMonthlyPanel : crypto.randomUUID();
    historyToken.current = token;
    if (previousHistory?.fireovaMonthlyPanel !== token) window.history.pushState({ ...previousHistory, fireovaMonthlyPanel: token }, '');
    // Forward can reopen the sheet without activating its trigger. The browser
    // may restore focus to the body or the closing sheet during that traversal.
    const trigger = document.querySelector<HTMLElement>('button[aria-controls="monthly-plan-panel"]');
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePanel(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const targets = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href]')].filter(element => element.getClientRects().length);
      const first = targets[0], last = targets.at(-1); if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (window.history.state?.fireovaMonthlyPanel === token) window.history.replaceState({ ...previousHistory, fireovaMonthlyPanel: undefined }, ''); historyToken.current = null; requestAnimationFrame(() => {
      // A rapid Forward/reopen must keep focus inside the new modal session.
      if (historyToken.current) return;
      const target = trigger?.isConnected ? trigger : previous;
      if (target?.isConnected && !panelRef.current?.contains(target)) target.focus();
    }); };
  }, [open, mobile, closePanel]);

  async function save(priorities: MonthlyPriority[], revision = state.plan?.features.revision, key = month) {
    if (revision == null || saving.current.has(key) || !validPriorities(priorities)) return;
    saving.current.add(key); requests.current[key] = (requests.current[key] || 0) + 1;
    update(key, current => ({ ...current, saving: true, loading: false, error: '', saved: false, pending: priorities }));
    try {
      const response = await fetch('/api/monthly-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: key, revision, priorities }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save. Your edits are kept.');
      if (data.month !== key || data.revision !== revision + 1 || !validPriorities(data.priorities)) throw new Error('Could not confirm the save. Your edits are kept.');
      update(key, current => ({ ...current, plan: current.plan ? { ...current.plan, features: data } : current.plan, input: '', editId: null, saving: false, saved: true, error: '', latest: undefined, pending: undefined, reviewing: false }));
    } catch (error) {
      update(key, current => ({ ...current, saving: false, error: error instanceof Error ? error.message : 'Could not save. Your edits are kept.' }));
    } finally { saving.current.delete(key); }
  }
  function submit() {
    const text = state.input.trim(); if (!text || state.saving || !state.plan || state.latest) return;
    const priorities = state.editId ? state.plan.features.priorities.map(item => item.id === state.editId ? { ...item, text } : item) : [...state.plan.features.priorities, { id: crypto.randomUUID(), text }];
    void save(priorities);
  }
  function navigate(next: string) { if (!validMonth(next)) return; setMonth(next); setDay(null); }
  const entries = state.plan?.entries || [];
  const visibleEntries = day ? entries.filter(item => item.date === day) : entries;
  const unscheduled = entries.filter(item => !['Scheduled', 'Published'].includes(item.status)).length;
  const inputDisabled = state.saving || !state.plan || Boolean(state.latest);
  const currentDirty = dirty(state);

  return <>
    {open && mobile && <div className={styles.backdrop} onMouseDown={() => closePanel()} aria-hidden="true" />}
    <aside hidden={!open} ref={panelRef} className={`${styles.panel} ${mobile ? styles.sheet : ''}`} id="monthly-plan-panel" role={mobile ? 'dialog' : 'complementary'} aria-modal={mobile ? true : undefined} aria-labelledby="monthly-plan-title" tabIndex={-1}>
      <header className={styles.heading}><h2 id="monthly-plan-title">Monthly plan</h2><button type="button" aria-label="Close monthly plan" onClick={() => closePanel()} className={styles.icon}>×</button></header>
      <div className={styles.monthNav}>
        <button type="button" className={styles.icon} aria-label="Previous month" disabled={!validMonth(shiftMonth(month, -1))} onClick={() => navigate(shiftMonth(month, -1))}>‹</button>
        <label className={styles.monthLabel}><span>{monthTitle(month)}</span><input type="month" aria-label="Month" min="2000-01" max="2100-12" value={month} onChange={event => navigate(event.target.value)} /></label>
        <button type="button" className={styles.icon} aria-label="Next month" disabled={!validMonth(shiftMonth(month, 1))} onClick={() => navigate(shiftMonth(month, 1))}>›</button>
      </div>
      <div className={styles.calendar} aria-label={`${monthTitle(month)} planning dates`}>
        {['M','T','W','T','F','S','S'].map((label, index) => <span key={`weekday-${index}`} className={styles.weekday} aria-hidden="true">{label}</span>)}
        {monthCells(month).map(cell => { const count = entries.filter(entry => entry.date === cell.date).length; return <button type="button" key={cell.date} disabled={!cell.current || !count} className={`${styles.day} ${count ? styles.hasPosts : ''} ${day === cell.date ? styles.selected : ''}`} aria-label={`${cell.date}${count ? `, ${count} ${count === 1 ? 'post' : 'posts'}` : ''}`} aria-pressed={day === cell.date} onClick={() => setDay(current => current === cell.date ? null : cell.date)}><span>{cell.day}</span>{Boolean(count) && <span className={styles.dot} aria-hidden="true" />}</button>; })}
      </div>
      <section className={styles.features} aria-labelledby="monthly-features-title">
        <div className={styles.sectionHeading}><h3 id="monthly-features-title">Must feature</h3><span role="status" className={styles.muted}>{state.saving ? 'Saving…' : currentDirty ? 'Unsaved' : state.saved ? 'Saved' : ''}</span></div>
        <ul className={styles.priorities}>{state.plan?.features.priorities.map(item => <li key={item.id}><p>{item.text}</p><div><button type="button" aria-label={`Edit priority: ${item.text.slice(0, 50)}`} disabled={state.saving || Boolean(state.editId) || Boolean(state.input) || Boolean(state.latest)} onClick={() => { update(month, current => ({ ...current, editId: item.id, input: item.text, saved: false, pending: undefined })); inputRef.current?.focus(); }}>Edit</button><button type="button" aria-label={`Remove priority: ${item.text.slice(0, 50)}`} disabled={state.saving || currentDirty || Boolean(state.latest)} onClick={() => void save(state.plan!.features.priorities.filter(priority => priority.id !== item.id))}>Remove</button></div></li>)}</ul>
        <form onSubmit={event => { event.preventDefault(); submit(); }}>
          <label className={styles.srOnly} htmlFor="monthly-priority-input">{state.editId ? 'Edit priority' : 'Add a priority'}</label>
          <textarea ref={inputRef} id="monthly-priority-input" rows={3} maxLength={MAX_PRIORITY_LENGTH} disabled={inputDisabled || (!state.editId && (state.plan?.features.priorities.length || 0) >= MAX_PRIORITIES)} value={state.input} placeholder="Event, menu item or announcement" onChange={event => update(month, current => ({ ...current, input: event.target.value, pending: undefined, saved: false }))} />
          {(state.input.length > 900 || (state.plan?.features.priorities.length || 0) >= MAX_PRIORITIES) && <p className={styles.muted}>{state.input.length > 900 ? `${state.input.length} / ${MAX_PRIORITY_LENGTH} characters` : '20 priorities maximum'}</p>}
          <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={inputDisabled || !state.input.trim() || (!state.editId && (state.plan?.features.priorities.length || 0) >= MAX_PRIORITIES)}>{state.editId ? 'Save changes' : '+ Add priority'}</button>{(state.editId || state.input) && <button type="button" disabled={state.saving} onClick={() => update(month, current => ({ ...current, input: '', editId: null, pending: undefined, saved: false }))}>Cancel</button>}</div>
        </form>
        {state.pending && !state.input && !state.editId && !state.latest && !state.saving && <div className={styles.formActions}><button type="button" onClick={() => void save(state.pending!)}>Retry save</button><button type="button" onClick={() => update(month, current => ({ ...current, pending: undefined, error: '' }))}>Cancel</button></div>}
        {state.error && <div role="alert" className={styles.error}><p>{state.error}</p><button type="button" disabled={state.saving || state.loading} onClick={async () => { await load(month); update(month, current => ({ ...current, reviewing: true })); }}>{currentDirty ? 'Review latest' : 'Retry'}</button></div>}
        {state.latest && state.reviewing && <div className={styles.conflict}><p>Saved in another window</p><ul>{state.latest.priorities.length ? state.latest.priorities.map(item => <li key={item.id}>{item.text}</li>) : <li>No priorities</li>}</ul><div className={styles.formActions}><button type="button" disabled={state.saving} onClick={() => update(month, current => ({ ...current, plan: current.plan && current.latest ? { ...current.plan, features: current.latest } : current.plan, input: '', editId: null, pending: undefined, latest: undefined, error: '', reviewing: false, saved: false }))}>Use saved</button>{!state.pending && Boolean(state.input || state.editId) && <button type="button" disabled={state.saving} onClick={() => update(month, current => ({ ...current, plan: current.plan && current.latest ? { ...current.plan, features: current.latest } : current.plan, editId: current.latest?.priorities.some(item => item.id === current.editId) ? current.editId : null, latest: undefined, error: '', reviewing: false, saved: false }))}>Keep editing</button>}{state.pending && <button type="button" disabled={state.saving} onClick={() => void save(state.pending!, state.latest!.revision)}>Save my version</button>}</div></div>}
      </section>
      <div className={styles.planSection}>
        <div className={styles.sectionHeading}><h3>In the plan</h3>{day && <button type="button" onClick={() => setDay(null)}>Show month</button>}</div>
        {unscheduled > 0 && <p className={styles.muted}>Unscheduled · {unscheduled}</p>}
        {state.loading && <p role="status" className={styles.muted}>Loading…</p>}
        {!state.loading && state.plan && !visibleEntries.length && <p className={styles.muted}>No posts yet</p>}
        <ol className={styles.posts}>{visibleEntries.map(entry => <li key={entry.id}><span className={styles.date}>{entry.date.slice(8)}</span>{entry.draftId && !draftIds.includes(entry.draftId) ? <button type="button" className={styles.postTitle} onClick={() => window.location.reload()}>{entry.title}<small className={styles.muted} style={{ display: 'block' }}>Refresh to open</small></button> : entry.draftId ? <button type="button" onClick={() => mobile ? closePanel(() => onOpenDraft(entry.draftId!)) : onOpenDraft(entry.draftId!)} className={styles.postTitle}>{entry.title}</button> : entry.postId ? <a className={styles.postTitle} href={`/content-bank/${encodeURIComponent(entry.postId)}`}>{entry.title}</a> : <span className={styles.postTitle}>{entry.title}</span>}<span className={styles.status}>{entry.status}</span></li>)}</ol>
        {state.plan?.truncated && <p className={styles.muted}>Showing the first 200 posts</p>}
      </div>
    </aside>
  </>;
}
