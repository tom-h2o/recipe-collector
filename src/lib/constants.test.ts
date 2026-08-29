import { describe, it, expect } from 'vitest';
import { MODEL_GROUPS, MODELS, DEFAULT_MODEL } from './constants';

describe('Gemini model list', () => {
  it('offers the default model, so the dropdown always has a valid selection', () => {
    // If DEFAULT_MODEL is not in MODELS the Select renders with nothing chosen
    // and the user cannot tell which model is actually in use.
    expect(MODELS).toContain(DEFAULT_MODEL);
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

  it('keeps preview models in a group labelled as preview', () => {
    for (const group of MODEL_GROUPS) {
      const previews = group.models.filter((m) => m.includes('preview'));
      if (previews.length) {
        expect(group.label.toLowerCase(), `${previews.join(', ')} sit in "${group.label}"`).toContain('preview');
      }
    }
  });

  it('excludes models Google has retired', () => {
    // gemini-2.5-flash-lite is still advertised by ListModels but generateContent
    // returns 404 "no longer available to new users" — see migration 0044.
    expect(MODELS).not.toContain('gemini-2.5-flash-lite');
  });

  it('has no empty groups', () => {
    for (const group of MODEL_GROUPS) {
      expect(group.models.length, `"${group.label}" is empty`).toBeGreaterThan(0);
    }
  });
});
