/** Extract bounded, safe client-side messages from FastAPI/Next.js errors. */
export function explainBackendError(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail.trim()) return detail.slice(0, 700);
  if (Array.isArray(detail)) {
    const fields = detail.slice(0, 3).map((issue: unknown) => {
      if (!issue || typeof issue !== 'object') return '';
      const item = issue as {loc?: unknown; msg?: unknown};
      const loc = Array.isArray(item.loc) ? item.loc.filter((p): p is string | number =>
        typeof p === 'string' || typeof p === 'number').slice(1).join('.') : '';
      const msg = typeof item.msg === 'string' ? item.msg.slice(0, 160) : 'Invalid field';
      return loc ? `${loc}: ${msg}` : msg;
    }).filter(Boolean);
    if (fields.length) return `Invalid upload: ${fields.join('; ')}`;
  }
  if (status === 404) return 'Endpoint or conversation not found. Confirm the Phase 4 FastAPI version and restart both services.';
  if (status === 422) return 'The backend rejected the form. Check the attached file type, its contents, and the message.';
  return `MUSE Nova backend returned HTTP ${status}.`;
}

/** Only the exact backend session-expiry error is safe to retry as a new conversation. */
export function shouldRecoverConversation(status: number, detail: unknown, hasSession: boolean): boolean {
  return hasSession && status === 404 && detail === 'Unknown conversation_id';
}
