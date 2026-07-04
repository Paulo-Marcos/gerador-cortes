import { describe, expect, it } from 'vitest';
import { LOG_OPTIONS } from '../SettingsModal';

describe('SettingsModal log options', () => {
  it('exposes the supported log levels in UI order', () => {
    expect(LOG_OPTIONS.map((option) => option.value)).toEqual(['disabled', 'info', 'debug']);
  });

  it('keeps user-facing labels explicit', () => {
    expect(LOG_OPTIONS.map((option) => option.label)).toEqual([
      'Desabilitado',
      'Informativo',
      'Debug',
    ]);
  });
});
