/**
 * Finds cooking durations in a step so cook mode can offer a one-tap timer.
 *
 * Roughly a quarter of the steps in this vault mention one ("simmer for 10
 * minutes"), across English, German and Polish — the three languages present in
 * the recipes. Anything not recognised simply offers no chip; the manual timer
 * is always available, so a miss costs nothing while a false positive would put
 * a nonsense button in front of someone mid-cook.
 */
export interface ParsedDuration {
  /** Shown on the chip, e.g. "30 min". */
  label: string;
  seconds: number;
}

/** Unit words per language, mapped to seconds. Longest forms first so "min" cannot shadow "minuten". */
const UNITS: { pattern: string; seconds: number }[] = [
  { pattern: 'godzin(?:y|ę|a)?|stunden?|hours?|hrs?|std', seconds: 3600 },
  { pattern: 'minut(?:y|ę|a)?|minuten?|minutes?|mins?', seconds: 60 },
  { pattern: 'sekund(?:y|ę|a)?|sekunden?|seconds?|secs?', seconds: 1 },
];

const UNIT_ALTERNATION = UNITS.map((u) => u.pattern).join('|');

/**
 * A number, optionally a range ("20-30", "20 to 30", "20 bis 30"), then a unit.
 * The unit is mandatory: without it "180" in "heat to 180" would become a timer.
 */
const DURATION = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*(?:(?:-|–|—|to|bis|do)\s*(\d+(?:[.,]\d+)?))?\s*(${UNIT_ALTERNATION})\b`,
  'gi',
);

function secondsForUnit(unit: string): number {
  const lower = unit.toLowerCase();
  for (const { pattern, seconds } of UNITS) {
    if (new RegExp(`^(?:${pattern})$`, 'i').test(lower)) return seconds;
  }
  return 0;
}

/**
 * Never rounds a label away from the time it will actually count. An earlier
 * version rounded to whole minutes, so a 90-second timer offered a chip reading
 * "2 min" — half a minute of overcooking for whoever trusted the label.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;

  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m} min` : `${m} min ${s} sec`;
  }

  const h = Math.floor(seconds / 3600);
  const remainder = seconds % 3600;
  if (remainder === 0) return `${h} hr`;
  const m = Math.floor(remainder / 60);
  const s = remainder % 60;
  if (s !== 0) return `${h} hr ${m} min ${s} sec`;
  return `${h} hr ${m} min`;
}

/** mm:ss, or h:mm:ss past an hour. For the running countdown. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/** Anything longer than this in one step is a marinade or a prove, not a timer someone stands over. */
const MAX_SECONDS = 24 * 3600;

export function parseDurations(text: string): ParsedDuration[] {
  if (!text) return [];
  const found: ParsedDuration[] = [];
  const seen = new Set<number>();

  for (const match of text.matchAll(DURATION)) {
    const unitSeconds = secondsForUnit(match[3]);
    if (!unitSeconds) continue;

    // A range offers both ends: "press for 20-30 minutes" is two useful timers,
    // and picking one for the cook would be guessing.
    for (const raw of [match[1], match[2]]) {
      if (!raw) continue;
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) continue;

      const seconds = Math.round(value * unitSeconds);
      if (seconds <= 0 || seconds > MAX_SECONDS) continue;
      if (seen.has(seconds)) continue;

      seen.add(seconds);
      found.push({ label: formatDuration(seconds), seconds });
    }
  }

  // Ordered shortest first, and capped: a step listing six durations would push
  // the step text off a phone screen.
  return found.sort((a, b) => a.seconds - b.seconds).slice(0, 4);
}
