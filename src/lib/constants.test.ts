import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS, MODELS, DEFAULT_MODEL } from './constants';

describe('Gemini model list', () => {
  it('offers the default model, so the dropdown always has a valid selection', () => {
    // If DEFAULT_MODEL is not in MODELS the Select renders with nothing chosen
    // and the user cannot tell which model is actually in use.
    expect(MODELS).toContain(DEFAULT_MODEL);
  });

  it('stays short enough to be a real choice', () => {
    // A dozen ids named gemini-3.x-flash-something is not a decision anyone can
    // make. Three tiers — cheap, balanced, accurate — cover the useful range.
    expect(MODEL_OPTIONS.length).toBeGreaterThanOrEqual(3);
    expect(MODEL_OPTIONS.length).toBeLessThanOrEqual(5);
  });

  it('lists every model exactly once', () => {
    expect(MODELS).toHaveLength(new Set(MODELS).size);
  });

  it('uses plausible model IDs', () => {
    for (const model of MODELS) {
      expect(model, `"${model}" is not a gemini-<version> id`).toMatch(/^gemini-\d/);
    }
  });

  it('excludes the auto-updating -latest aliases', () => {
    // These re-point to new models without notice, which would silently change
    // behaviour for anyone who had saved that setting.
    expect(MODELS.filter((m) => m.endsWith('-latest'))).toEqual([]);
  });

  it('excludes non-text variants that cannot serve recipe extraction', () => {
    const wrongModality = MODELS.filter((m) => /image|tts|live|transcribe|audio|omni/.test(m));
    expect(wrongModality).toEqual([]);
  });

  it('excludes models Google has retired', () => {
    // gemini-2.5-flash-lite is still advertised by ListModels but generateContent
    // returns 404 "no longer available to new users" — see migration 0044.
    expect(MODELS).not.toContain('gemini-2.5-flash-lite');
  });

  it('tells the user when to pick each one', () => {
    for (const m of MODEL_OPTIONS) {
      expect(m.name, `${m.id} has no display name`).toBeTruthy();
      expect(m.description.length, `${m.id} has no useful description`).toBeGreaterThan(40);
      expect(m.price, `${m.id} has no price`).toMatch(/\$/);
    }
  });

  it('flags preview models as preview', () => {
    for (const m of MODEL_OPTIONS.filter((o) => o.id.includes('preview'))) {
      expect(
        `${m.badge ?? ''} ${m.description}`.toLowerCase(),
        `${m.id} is a preview model but nothing says so`,
      ).toContain('preview');
    }
  });
});
