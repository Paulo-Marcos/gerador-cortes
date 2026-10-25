import { describe, expect, it } from 'vitest';
import type { LayoutPreset } from '@/types/presets';
import { posicionamentoDoPreset } from '../youtubeLayoutPadrao';

// D-985: o "Definir ▾ → preset" da escada tira do preset o posicionamento do
// modo que está configurando — o Full chega como sintético de 1 tela.

const base = { id: 'p', nome: 'P', criado_em: '', atualizado_em: '' };
const full = {
  ...base,
  tipo: 'posicionamento_full',
  payload: { full: { crop: { x: 228, y: 145, w: 1465, h: 791 }, slot: { x: 469, y: 202, w: 1398, h: 755 } } },
} as unknown as LayoutPreset;
const compartilhado = {
  ...base,
  tipo: 'posicionamento',
  payload: { compartilhada: { telas: 2, zona_card: { x: 40, y: 213, w: 444, h: 441 } } },
} as unknown as LayoutPreset;

describe('posicionamento do preset por modo (D-985)', () => {
  it('Full: o recorte vira a tela única do sintético', () => {
    const config = posicionamentoDoPreset(full, 'full');
    expect(config?.telas).toBe(1);
    expect(config?.crop_tela).toEqual({ x: 228, y: 145, w: 1465, h: 791 });
    expect(config?.slot_tela).toEqual({ x: 469, y: 202, w: 1398, h: 755 });
  });

  it('Compartilhado: as duas telas e a zona dos cards', () => {
    const config = posicionamentoDoPreset(compartilhado, 'compartilhada');
    expect(config?.telas).toBe(2);
    expect(config?.zona_card).toEqual({ x: 40, y: 213, w: 444, h: 441 });
  });

  it('preset sem o modo pedido não traz nada', () => {
    expect(posicionamentoDoPreset(full, 'compartilhada')).toBeNull();
    expect(posicionamentoDoPreset(compartilhado, 'full')).toBeNull();
  });
});
