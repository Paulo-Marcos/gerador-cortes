import { describe, expect, it } from 'vitest';
import { luzDoCanalDe } from '@/lib/luzDoCanal';

// O hook `useLuzDoCanal` é só `useCanais` + `luzDoCanalDe`; o payload real de /api/channels é
// o que decide as três fontes.
const canal = {
  id: 'a',
  paleta: { primaria: '', secundaria: '', acento: '' },
  luz: ['#1f9d8f', '#f0b43a'],
};

describe('luz do canal a partir do payload de /api/channels', () => {
  it('luz preenchido', () => expect(luzDoCanalDe(canal, 'escuro')).not.toBeNull());
  it('luz vazio (canal sem capa)', () =>
    expect(luzDoCanalDe({ ...canal, luz: [] }, 'escuro')).toBeNull());
});
