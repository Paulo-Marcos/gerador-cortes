import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPromptAutoCopyTarget } from '../PromptManualPanel';

describe('PromptManualPanel auto-copy', () => {
  it('selects the first available prompt part with the JSON code block instruction', () => {
    const target = getPromptAutoCopyTarget({
      prompts: [
        { parte: 1, total_partes: 2, texto: '' },
        { parte: 2, total_partes: 2, texto: 'Prompt da parte 2' },
      ],
    });

    expect(target?.index).toBe(1);
    expect(target?.text).toContain('Prompt da parte 2');
    expect(target?.text).toContain('```json');
    expect(target?.key).toContain('2:2');
  });

  it('returns null while the prompt has not loaded yet', () => {
    expect(getPromptAutoCopyTarget(undefined)).toBeNull();
    expect(getPromptAutoCopyTarget({ prompts: [{ texto: '' }] })).toBeNull();
  });

  it('keeps the panel wired to copy automatically when prompt data arrives', () => {
    const source = readFileSync(new URL('../PromptManualPanel.tsx', import.meta.url), 'utf8');

    expect(source).toContain('useEffect(() =>');
    expect(source).toContain('getPromptAutoCopyTarget(prompt.data)');
    expect(source).toContain('copyTextToClipboard(autoCopyTarget.text)');
  });
});
