export type LiveTranscriptEvent = {
  type: string;
  turnId?: number;
  transcript?: string;
  final?: boolean;
  message?: string;
};

// Pure reducer helper: turns are keyed by id because completed turns may arrive out of order.
export function processLiveEvent(
  raw: LiveTranscriptEvent,
  completedTurnIds: Set<number>,
): {kind:'ready'|'start'|'partial'|'final'|'error'|'ignore'; text?:string} {
  if (raw.type === 'ready') return {kind:'ready'};
  if (raw.type === 'speechStart') return {kind:'start'};
  if (raw.type === 'transcript') return {
    kind:'partial', text: typeof raw.transcript === 'string' ? raw.transcript : '',
  };
  if (raw.type === 'speechComplete') {
    if (!Number.isInteger(raw.turnId) || completedTurnIds.has(raw.turnId!)) return {kind:'ignore'};
    completedTurnIds.add(raw.turnId!);
    const text = typeof raw.transcript === 'string' ? raw.transcript.trim() : '';
    return text ? {kind:'final', text:text.slice(0,4000)} : {kind:'ignore'};
  }
  if (raw.type === 'error') return {kind:'error', text:raw.message || 'Realtime voice error'};
  return {kind:'ignore'};
}
