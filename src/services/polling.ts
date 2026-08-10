/**
 * One poller, used by both things in this app that wait on a server-side job:
 * the OAuth handshake and a rung whose verifier is still running. The policy is
 * data rather than a loop written twice, so the two cannot drift apart.
 */

export interface PollPolicy {
  attempts: number;
  intervalMs: number;
}

/**
 * The student app's shape, kept deliberately: twenty attempts at two seconds.
 * Forty seconds is long enough for a consent screen and short enough that a
 * person who abandoned the flow is not left watching a spinner.
 */
export const oauthPollPolicy: PollPolicy = { attempts: 20, intervalMs: 2000 };

/**
 * A verifier lookup against an authority can take days, so the screen polls
 * only while it is open and gives up quietly rather than pretending to wait.
 */
export const verifierPollPolicy: PollPolicy = { attempts: 30, intervalMs: 5000 };

export type Wait = (ms: number) => Promise<void>;

const realWait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollHandle {
  /** Stops the run. A resolved poll and a cancelled one both settle undefined. */
  cancel(): void;
}

/**
 * Runs `step` until it returns a value, the attempts run out, or the handle is
 * cancelled. `step` returning undefined means "still working"; throwing means
 * the attempt failed and is counted like any other, because a single dropped
 * request during a handshake is not a reason to abandon it.
 */
export async function poll<T>(
  policy: PollPolicy,
  step: (attempt: number) => Promise<T | undefined>,
  options: { wait?: Wait; handle?: PollHandle & { cancelled?: boolean } } = {},
): Promise<T | undefined> {
  const wait = options.wait ?? realWait;
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    if (options.handle?.cancelled) return undefined;
    try {
      const result = await step(attempt);
      if (result !== undefined) return result;
    } catch {
      // Counted, not fatal. The next attempt runs.
    }
    if (attempt < policy.attempts) await wait(policy.intervalMs);
  }
  return undefined;
}

/** A cancel token a screen can hold across an unmount. */
export function pollHandle(): PollHandle & { cancelled: boolean } {
  return {
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
}
