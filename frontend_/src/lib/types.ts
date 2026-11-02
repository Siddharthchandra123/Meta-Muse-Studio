export type Usage = { input_tokens?: number|null; output_tokens?: number|null; cached_input_tokens?: number|null; estimated_cost_usd?: number|null };
export type ChatMessage = { id: string; role: 'user'|'assistant'; text: string; status: 'done'|'streaming'|'failed'|'stopped'; createdAt: number; imageNames?: string[]; documentNames?: string[]; usage?: Usage };
export type Thread = { id: string; title: string; conversationId: string|null; messages: ChatMessage[]; createdAt: number; updatedAt: number };
export type UsageSummary = { completed_calls: number; estimated_total_usd: number; calls_without_pricing: number; disclaimer: string };
export type Health = { status: string; service: string; version: string };

export const STORE_KEY = 'muse-nova-threads-v0.3';
export const ACTIVE_KEY = 'muse-nova-active-thread-v0.3';
export const THEME_KEY = 'muse-nova-theme-v0.3';
export const MAX_THREADS = 24;

export function newThread(): Thread {
  const now = Date.now();
  return {id: crypto.randomUUID(), title:'New conversation', conversationId:null, messages:[], createdAt:now, updatedAt:now};
}
export function readThreads(): Thread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is Thread => typeof t?.id === 'string' && Array.isArray(t?.messages) && typeof t.title === 'string')
      .slice(0, MAX_THREADS).map(t => ({...t, messages:t.messages.slice(-80)}));
  } catch { return []; }
}
export function persistThreads(threads: Thread[]) {
  if (typeof window === 'undefined') return;
  try {localStorage.setItem(STORE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS).map(t => ({...t, messages:t.messages.slice(-80)}))));}
  catch { /* Browser storage is best-effort; user can still chat. */ }
}
