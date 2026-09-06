import { describe, it, expect } from 'vitest';
import { parseDurations, formatDuration, formatClock } from './parseDurations';

describe('parseDurations', () => {
  it('finds a plain duration', () => {
    expect(parseDurations('Simmer for 10 minutes.')).toEqual([{ label: '10 min', seconds: 600 }]);
  });

  it('offers both ends of a range rather than guessing', () => {
    // Verbatim from a recipe in the vault.
    expect(parseDurations('Press the tofu for 20-30 minutes.')).toEqual([
      { label: '20 min', seconds: 1200 },
      { label: '30 min', seconds: 1800 },
    ]);
  });

  it('handles the other range spellings', () => {
    expect(parseDurations('bake 20 to 25 minutes')).toHaveLength(2);
    expect(parseDurations('30 bis 40 Minuten backen')).toHaveLength(2);
  });

  it('reads German and Polish, the other languages in this vault', () => {
    expect(parseDurations('15 Minuten köcheln lassen')).toEqual([{ label: '15 min', seconds: 900 }]);
    expect(parseDurations('Gotuj przez 20 minut')).toEqual([{ label: '20 min', seconds: 1200 }]);
    expect(parseDurations('1 Stunde ruhen lassen')).toEqual([{ label: '1 hr', seconds: 3600 }]);
  });

  it('handles hours and seconds', () => {
    expect(parseDurations('rest for 1 hour')).toEqual([{ label: '1 hr', seconds: 3600 }]);
    expect(parseDurations('blanch for 90 seconds')).toEqual([{ label: '1 min 30 sec', seconds: 90 }]);
    expect(parseDurations('cook 1.5 hours')).toEqual([{ label: '1 hr 30 min', seconds: 5400 }]);
  });

  it('ignores numbers that are not durations', () => {
    // The unit is mandatory precisely so an oven temperature never becomes a timer.
    expect(parseDurations('Preheat the oven to 180°C')).toEqual([]);
    expect(parseDurations('Heat to 350 degrees')).toEqual([]);
    expect(parseDurations('Add 2 eggs and 250 ml milk')).toEqual([]);
    expect(parseDurations('Step 3: combine')).toEqual([]);
  });

  it('drops durations too long to stand over', () => {
    // A 48-hour cure is not a kitchen timer.
    expect(parseDurations('Cure for 48 hours')).toEqual([]);
    expect(parseDurations('Marinate for 24 hours')).toEqual([{ label: '24 hr', seconds: 86400 }]);
  });

  it('de-duplicates and caps what it offers', () => {
    expect(parseDurations('10 minutes, then another 10 minutes')).toEqual([
      { label: '10 min', seconds: 600 },
    ]);
    expect(parseDurations('1 min 2 min 3 min 4 min 5 min 6 min')).toHaveLength(4);
  });

  it('returns shortest first', () => {
    const out = parseDurations('fry 7 minutes then rest 1 hour');
    expect(out.map((d) => d.seconds)).toEqual([420, 3600]);
  });

  it('survives empty and junk input', () => {
    expect(parseDurations('')).toEqual([]);
    expect(parseDurations('no timings here at all')).toEqual([]);
  });
});

describe('formatDuration', () => {
  it('reads naturally at each scale', () => {
    expect(formatDuration(45)).toBe('45 sec');
    // Never round away real time: a 90 second timer labelled "2 min" would
    // overcook whatever the cook trusted the label for.
    expect(formatDuration(90)).toBe('1 min 30 sec');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(5400)).toBe('1 hr 30 min');
  });
});

describe('formatClock', () => {
  it('counts down in mm:ss, and h:mm:ss past an hour', () => {
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
