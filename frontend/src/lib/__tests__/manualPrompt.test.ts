import { describe, expect, it } from 'vitest';
import {
  ensureJsonCodeBlockInstruction,
  extractJsonText,
  getManualPromptText,
  parseManualJson,
} from '../manualPrompt';

describe('manualPrompt', () => {
  it('parses plain JSON', () => {
    expect(parseManualJson('{ "cortes": [] }')).toEqual({ cortes: [] });
  });

  it('extracts JSON from a fenced code block', () => {
    const input = ['Resposta:', '```json', '{ "trechos": [] }', '```'].join('\n');

    expect(extractJsonText(input)).toBe('{ "trechos": [] }');
    expect(parseManualJson(input)).toEqual({ trechos: [] });
  });

  it('adds JSON code block instruction without duplicating it', () => {
    const prompt = ensureJsonCodeBlockInstruction('Retorne o JSON.');

    expect(prompt).toContain('```json');
    expect(ensureJsonCodeBlockInstruction(prompt)).toBe(prompt);
  });

  it('returns the selected prompt part with JSON instruction', () => {
    const prompt = getManualPromptText(
      { prompts: [{ texto: 'Parte 1' }, { texto: 'Parte 2' }] },
      1,
    );

    expect(prompt).toContain('Parte 2');
    expect(prompt).toContain('```json');
  });
});
