import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Thumbnail } from '@remotion/player';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cenaSchema, tirarCenasRiscadas } from '@video-renderer/public-api';
import { OverlaySceneV2 } from '@video-renderer/OverlaySceneV2';
import { OverlayTimelineV2 } from '@video-renderer/OverlayTimelineV2';
import type { CenaRemotion } from '@/types/models';
import { CenasRemotionPreview } from '../CenasRemotionPreview';

// D-1070: o lado do renderer. A cena riscada fica no plano da Pós, mas não entra no
// vídeo: as composições do worker e a prévia do editor tiram as riscadas pela mesma
// regra, e `manual` não muda nada do visual.

const cena = (texto: string, campos: Partial<CenaRemotion> = {}) =>
  ({ tipo: 'definicao_termo', inicio: 0, fim: 5, texto, contexto: 'Um contexto.', ...campos }) as CenaRemotion;

function quadro<P extends Record<string, unknown>>(componente: ComponentType<P>, props: P) {
  return renderToStaticMarkup(
    <Thumbnail
      component={componente as ComponentType<Record<string, unknown>>}
      inputProps={props}
      compositionWidth={1920}
      compositionHeight={1080}
      frameToDisplay={45}
      durationInFrames={150}
      fps={30}
    />,
  );
}

describe('o schema da cena (a definição única)', () => {
  it('aceita a cena sem os campos do plano, como sempre', () => {
    const lida = cenaSchema.parse({ tipo: 'enfase', inicio: 1, fim: 4, texto: 'Tese' });
    expect(lida).not.toHaveProperty('riscada');
    expect(lida).not.toHaveProperty('manual');
  });

  it('aceita e guarda riscada e manual', () => {
    const lida = cenaSchema.parse({ tipo: 'enfase', inicio: 1, fim: 4, riscada: true, manual: true });
    expect(lida).toMatchObject({ riscada: true, manual: true });
  });

  it('recusa riscada que não é booleana', () => {
    expect(cenaSchema.safeParse({ tipo: 'enfase', inicio: 1, fim: 4, riscada: 'sim' }).success).toBe(false);
  });

  it('o contrato do backend sai do mesmo schema e traz os dois campos', () => {
    const contrato = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../../../video-renderer/protocol/cena.schema.json'), 'utf-8'),
    );
    expect(contrato.properties.riscada).toEqual({ type: 'boolean' });
    expect(contrato.properties.manual).toEqual({ type: 'boolean' });
  });
});

describe('quem vai ao vídeo', () => {
  it('tira só as riscadas, na ordem do plano', () => {
    const plano = [cena('a'), cena('b', { riscada: true }), cena('c', { manual: true })];
    expect(tirarCenasRiscadas(plano).map((c) => c.texto)).toEqual(['a', 'c']);
  });

  it('a cena trazida de volta (sem a marca) volta ao vídeo', () => {
    expect(tirarCenasRiscadas([cena('a', { riscada: false })])).toHaveLength(1);
  });
});

describe('as composições do worker', () => {
  const props = (cenas: CenaRemotion[]) => ({
    cenas,
    durationFrames: 150,
    sombraNivelPadrao: 'nenhuma',
    layoutCardPadrao: 'vertical',
    fontPreset: 'atual',
  });

  it('a linha de overlays desenha a cena de controle e não desenha a riscada', () => {
    const html = quadro(OverlayTimelineV2 as never, props([cena('Fica no vídeo'), cena('Saiu do vídeo', { riscada: true })]));
    expect(html).toContain('Fica no vídeo');
    expect(html).not.toContain('Saiu do vídeo');
  });

  it('a mesma cena, sem riscar, aparece (controle)', () => {
    expect(quadro(OverlayTimelineV2 as never, props([cena('Saiu do vídeo')]))).toContain('Saiu do vídeo');
  });

  it('a cena manual desenha igual à da IA', () => {
    const daIa = quadro(OverlayTimelineV2 as never, props([cena('Igual')]));
    const manual = quadro(OverlayTimelineV2 as never, props([cena('Igual', { manual: true })]));
    expect(manual).toBe(daIa);
  });

  it('o overlay de uma cena só sai transparente quando ela está riscada', () => {
    const base = { durationFrames: 150, sombraNivelPadrao: 'nenhuma', layoutCardPadrao: 'vertical', fontPreset: 'atual' };
    expect(quadro(OverlaySceneV2 as never, { ...base, cena: cena('Sozinha') })).toContain('Sozinha');
    expect(quadro(OverlaySceneV2 as never, { ...base, cena: cena('Sozinha', { riscada: true }) })).not.toContain('Sozinha');
  });

  // As do Studio desenham sobre o vídeo, que suspende no render de servidor: o teste lê
  // o fonte e prende o filtro no laço das cenas.
  it.each(['CenaYouTubeV2.tsx', 'CenaReacao.tsx'])('a composição %s tira as riscadas antes do laço', (arquivo) => {
    const fonte = readFileSync(resolve(__dirname, `../../../../../../video-renderer/src/${arquivo}`), 'utf-8');
    expect(fonte).toContain('tirarCenasRiscadas(cenas).map(');
    expect(fonte).not.toMatch(/\{cenas\.map\(/);
  });
});

describe('a prévia do editor', () => {
  it('mostra o que o render vai usar: sem a riscada', () => {
    const html = quadro(CenasRemotionPreview as never, {
      cenas: [cena('Fica no vídeo'), cena('Saiu do vídeo', { riscada: true })],
    });
    expect(html).toContain('Fica no vídeo');
    expect(html).not.toContain('Saiu do vídeo');
  });
});
