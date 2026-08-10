/**
 * The escalation contract, client side. The backend already annotates history
 * with escalation state and returns pending plus query_id on send; this is the
 * half the student app parses and drops.
 */

export type EscalationStatus = 'pending' | 'answered' | 'closed';

export interface Escalation {
  queryId: string;
  status: EscalationStatus;
  askedAt?: string;
}

export interface Message {
  id: string;
  role: 'person' | 'navigator';
  text: string;
  sentAt: string;
  escalation?: Escalation;
}

/** Shapes the backend has been seen to send. Tolerant on read, single shape after. */
export interface RawMessage {
  id?: string | number;
  message_id?: string | number;
  role?: string;
  sender?: string;
  content?: string;
  text?: string;
  created_at?: string;
  timestamp?: string;
  meta?: { pending?: boolean; query_id?: string | number; [key: string]: unknown };
  escalation?: { query_id?: string | number; queryId?: string; status?: string };
}

export function parseMessage(raw: RawMessage): Message {
  const id = String(raw.id ?? raw.message_id ?? '');
  const role = (raw.role ?? raw.sender) === 'user' || (raw.role ?? raw.sender) === 'person' ? 'person' : 'navigator';
  const sentAt = raw.created_at ?? raw.timestamp ?? '';

  const queryId =
    raw.escalation?.query_id ?? raw.escalation?.queryId ?? raw.meta?.query_id ?? undefined;

  let escalation: Escalation | undefined;
  if (queryId !== undefined) {
    const status = normaliseStatus(raw.escalation?.status, raw.meta?.pending);
    escalation = { queryId: String(queryId), status, askedAt: sentAt || undefined };
  }

  return { id, role, text: raw.content ?? raw.text ?? '', sentAt, escalation };
}

function normaliseStatus(status: string | undefined, pending: boolean | undefined): EscalationStatus {
  if (status === 'answered' || status === 'resolved') return 'answered';
  if (status === 'closed') return 'closed';
  if (status === 'pending') return 'pending';
  return pending ? 'pending' : 'answered';
}

/**
 * A pending bubble flips to answered without a new message arriving, which is
 * the behaviour the backend was built for.
 */
export function mergeEscalations(
  messages: Message[],
  updates: { queryId: string; status: EscalationStatus }[],
): Message[] {
  if (updates.length === 0) return messages;
  const byId = new Map(updates.map((update) => [update.queryId, update.status]));
  return messages.map((message) => {
    if (!message.escalation) return message;
    const next = byId.get(message.escalation.queryId);
    if (!next || next === message.escalation.status) return message;
    return { ...message, escalation: { ...message.escalation, status: next } };
  });
}

/**
 * What the person reads on a pending bubble. Never names a role, a person or a
 * hop inside the practice, however many there are.
 */
export function escalationLine(escalation: Escalation, now: Date = new Date()): string {
  if (escalation.status === 'answered') return 'Answered by the practice';
  if (escalation.status === 'closed') return 'The practice closed this one without an answer';
  const asked = escalation.askedAt ? sinceLabel(escalation.askedAt, now) : undefined;
  return asked ? `Checking with the practice, asked ${asked}` : 'Checking with the practice';
}

export function sinceLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Query ids still open, for the poll that flips the bubbles. */
export function openQueryIds(messages: Message[]): string[] {
  return messages
    .filter((message) => message.escalation?.status === 'pending')
    .map((message) => message.escalation!.queryId);
}
