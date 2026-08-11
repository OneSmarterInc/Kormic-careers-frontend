import { CorridorConfig, applicableRungs, awaitsPractice, runsOnJoin } from '../models/corridor';

/**
 * The tour before signup. Every stop is derived from the corridor the person is
 * about to walk, so it cannot promise a ladder different from the one they get.
 * Nothing here is written copy about a credential; the rung names come from the
 * config.
 */

export interface TourStop {
  key: string;
  heading: string;
  body: string;
  /** Short lines under the body, e.g. the rungs themselves. */
  items?: string[];
}

export function buildTour(corridor: CorridorConfig | undefined): TourStop[] {
  if (!corridor) return [];
  const rungs = applicableRungs(corridor);
  const required = rungs.filter((rung) => rung.requirement === 'required');
  const optional = rungs.filter((rung) => rung.requirement === 'optional');
  // Split by what actually happens rather than by whether a bot exists. A rung
  // whose authority charges is not confirmed when you join, and telling a
  // joining candidate otherwise promises something they do not control.
  const checked = rungs.filter(runsOnJoin);
  const held = rungs.filter(awaitsPractice);
  const unchecked = rungs.filter((rung) => !runsOnJoin(rung) && !awaitsPractice(rung));

  const stops: TourStop[] = [
    {
      key: 'steps',
      heading: 'What we will ask you for',
      body:
        required.length === rungs.length
          ? `${rungs.length} things, all of them needed.`
          : `${required.length} things we need, and ${optional.length} you can skip and add later.`,
      items: rungs.map((rung) =>
        rung.requirement === 'optional' ? `${rung.displayName} (optional)` : rung.displayName,
      ),
    },
  ];

  if (checked.length > 0 || held.length > 0) {
    stops.push({
      key: 'checked',
      heading: 'What we check, and when',
      body:
        held.length > 0
          ? 'Some of these we confirm as soon as you give them to us. Others cost money to confirm with the body that issued them, so a practice decides that when they take you forward. Until then they are shown as what you told us.'
          : 'We confirm each of these against the body that issued it.',
      items: [
        ...checked.map((rung) => `${rung.displayName}: we check it now`),
        ...held.map((rung) => `${rung.displayName}: checked if a practice takes you forward`),
        ...unchecked.map((rung) => `${rung.displayName}: you tell us`),
      ],
    });
  }

  stops.push(
    {
      key: 'display',
      heading: 'What a practice sees',
      body:
        'Each fact on its own, with how it was checked and the date. There is no single badge that speaks for all of it, so nothing you provided yourself is ever shown as confirmed.',
    },
    {
      key: 'escalation',
      heading: 'When your Navigator does not know',
      body:
        'Your Navigator answers what it can. When the answer sits with the practice, it asks them and tells you it is checking, and the answer comes back into the same conversation.',
    },
    {
      key: 'cost',
      heading: 'What this costs you',
      body: 'Nothing. Practices pay to hire. Verification decides what is true about you, never whether you get seen.',
    },
  );

  return stops;
}

/**
 * No time estimate. We have not measured how long the ladder takes, and a
 * guessed "about five minutes" is the kind of claim the house rule exists to
 * stop. The step count is a fact; the duration is not, yet.
 */
export function stepCountLine(corridor: CorridorConfig | undefined): string {
  if (!corridor) return '';
  const count = applicableRungs(corridor).length;
  return `${count} step${count === 1 ? '' : 's'}`;
}

export function tourPosition(stops: TourStop[], index: number): { current: number; total: number } {
  return { current: Math.min(index + 1, stops.length), total: stops.length };
}
