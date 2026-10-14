import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENTES_PADRAO, temEcoNoShort } from '@/shared/palco/palcoLimpo';
import { cobrir, ECO_REDUCAO, FILTRO_DO_ECO, recortePrincipal } from '../EcoDaPrevia';
import type { PlanoDesenhavel } from '../shortsApi';

// D-913: o eco da prévia é o mesmo do render — a mesma janela, o mesmo filtro.

const FFMPEG_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/infrastructure/render/ffmpeg_short.py',
);

function constante(fonte: string, nome: string): number {
  const achado = new RegExp(`^${nome} = ([0-9.]+)`, 'm').exec(fonte);
  if (!achado) throw new Error(`${nome} sumiu do backend`);
  return Number(achado[1]);
}

const recorte = (w: number, h: number) =>
  ({
    origem: { x: 0, y: 0, w, h },
    destino: { x: 0, y: 0, w, h },
    recorta: { x: 0, y: 0, w, h },
  }) as unknown as PlanoDesenhavel['recortes'][number];

describe('EcoDaPrevia (D-913)', () => {
  it('usa os mesmos números do FFmpeg do backend', () => {
    const fonte = readFileSync(FFMPEG_DO_BACKEND, 'utf-8');
    expect(constante(fonte, '_ECO_REDUCAO')).toBe(ECO_REDUCAO);
    expect(FILTRO_DO_ECO).toBe(
      `blur(${constante(fonte, '_ECO_DESFOQUE')}px) saturate(${constante(fonte, '_ECO_SATURACAO')}) brightness(${constante(fonte, '_ECO_BRILHO')})`,
    );
  });

  it('o eco vem da janela que mais ocupa o quadro', () => {
    const pequena = recorte(400, 300);
    const grande = recorte(1080, 960);
    const plano = { recortes: [pequena, grande] } as unknown as PlanoDesenhavel;
    expect(recortePrincipal(plano)).toBe(grande);
  });

  it('cobre o quadro inteiro, centralizado', () => {
    expect(cobrir({ x: 0, y: 0, w: 400, h: 300 }, 270, 480)).toEqual({ x: -185, y: 0, w: 640, h: 480 });
  });

  it('só há eco no estilo limpo com o eco escolhido', () => {
    expect(temEcoNoShort(COMPONENTES_PADRAO)).toBe(false);
    expect(temEcoNoShort({ ...COMPONENTES_PADRAO, fundo_short: 'eco' })).toBe(false);
    expect(temEcoNoShort({ ...COMPONENTES_PADRAO, estilo: 'limpo', fundo_short: 'eco' })).toBe(true);
  });
});
