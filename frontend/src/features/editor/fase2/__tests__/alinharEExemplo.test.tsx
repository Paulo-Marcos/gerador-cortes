import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import { DEFAULT_YOUTUBE_LAYOUT } from '@/shared/palco/youtubeLayout';
import type { RascunhoDoPalco } from '@/features/channels/PalcoComponentesSection';
import { PresetsNaFaixa } from '../BarraDePresets';
import { edicaoDoRascunho } from '../ComponentesArrastaveis';
import { CropPicker } from '../CropPicker';
import { ExemploDoCard, TIPOS_COM_EXEMPLO, cenaDeExemplo } from '../ExemploDoCard';
import { alvosDe, encaixar } from '../guiasDeAlinhamento';
import { gruposDoModal } from '../MenuDoModal';
import { SlotPreview } from '../SlotPreview';

// D-928: zona dos cards sempre visível, alinhar objetos entre si, recorte com
// o mouse, presets sempre à vista e um card de exemplo na prévia.

const CONFIG = DEFAULT_YOUTUBE_LAYOUT.compartilhada;

describe('alinhar aos outros objetos (D-928)', () => {
  const alvos = alvosDe([{ x: 100, y: 100, w: 400, h: 300 }]);

  it('perto do meio do quadro, o centro gruda no meio e mostra a guia', () => {
    const { rect, guias } = encaixar({ x: 755, y: 600, w: 400, h: 200 }, 'mover', alvos);
    expect(rect.x + rect.w / 2).toBe(960);
    expect(guias.x).toBe(960);
  });

  it('a borda gruda na borda do outro objeto', () => {
    const { rect, guias } = encaixar({ x: 507, y: 700, w: 200, h: 100 }, 'mover', alvos);
    expect(rect.x).toBe(500);
    expect(guias.x).toBe(500);
  });

  it('longe de tudo, nada gruda e não há guia', () => {
    const { rect, guias } = encaixar({ x: 1300, y: 750, w: 50, h: 50 }, 'mover', alvos);
    expect(rect).toEqual({ x: 1300, y: 750, w: 50, h: 50 });
    expect(guias).toEqual({ x: null, y: null });
  });

  it('ao redimensionar, só a borda puxada pela alça gruda', () => {
    const { rect } = encaixar({ x: 100, y: 500, w: 395, h: 200 }, 'redimensionar', alvos);
    expect(rect).toEqual({ x: 100, y: 500, w: 400, h: 200 });
  });
});

describe('a zona dos cards não some (D-928)', () => {
  const desenhar = (comZonaDosCards: boolean) =>
    renderToStaticMarkup(
      <SlotPreview
        config={CONFIG}
        rectKey="slot_tela"
        currentTime={0}
        fundo="hud-forte"
        placa={{ nome: '', papel: '' }}
        comZonaDosCards={comZonaDosCards}
        onChangeSlot={() => undefined}
      />,
    );

  it('aparece tracejada mesmo sem estar selecionada, e se arrasta', () => {
    const html = desenhar(true);
    expect(html).toMatch(/data-retangulo="Cards \(automática\)"[^>]*class="[^"]*border-dashed/);
    expect(html).not.toMatch(/data-retangulo="Cards[^"]*"[^>]*pointer-events-none/);
  });

  it('no vídeo cheio não há zona dos cards', () => {
    expect(desenhar(false)).not.toContain('data-retangulo="Cards');
  });
});

describe('recorte com o mouse (D-928)', () => {
  it('sem "Desenhar", o recorte é um retângulo com alça de tamanho', () => {
    const html = renderToStaticMarkup(
      <CropPicker videoSrc="" currentTime={0} rect={CONFIG.crop_tela} drawingEnabled={false} onToggleDrawing={() => undefined} onChange={() => undefined} />,
    );
    expect(html).toContain('data-retangulo="Recorte"');
    expect(html).toContain('Redimensionar Recorte');
  });
});

describe('card de exemplo (D-928)', () => {
  it('todo tipo de card tem exemplo', () => {
    expect(TIPOS_COM_EXEMPLO).toEqual(expect.arrayContaining(['definicao_termo', 'pergunta_chat', 'linha_tempo', 'tela_cheia']));
  });

  it('na compartilhada o exemplo vai para a zona; no vídeo cheio, não', () => {
    const zona = { x: 1200, y: 100, w: 600, h: 800 };
    expect(cenaDeExemplo('definicao_termo', zona)).toMatchObject({ layout_youtube_modo: 'compartilhada', layout_card_zone: zona });
    expect(cenaDeExemplo('definicao_termo', null)).not.toHaveProperty('layout_card_zone');
  });

  it('desenha o card com a customização do palco', () => {
    const html = renderToStaticMarkup(
      <ExemploDoCard
        cena={cenaDeExemplo('definicao_termo', null)}
        estiloCenas={estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo' })}
      />,
    );
    expect(html).toContain('Clericalismo');
    expect(html).toContain('data-componente="cards"');
  });

  it('arrastar o card no vídeo cheio grava posição manual e o tamanho dos cards', () => {
    const inicial = { cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } } } as unknown as RascunhoDoPalco;
    let rascunho: RascunhoDoPalco | null = inicial;
    const mudar = (f: unknown) => {
      rascunho = (f as (r: RascunhoDoPalco | null) => RascunhoDoPalco | null)(rascunho);
    };
    const edicao = edicaoDoRascunho(inicial, mudar, null, () => undefined);
    edicao.mover('cards', 300, 200);
    edicao.escalar('cards', 2.5);
    expect(rascunho!.cards.posicao).toEqual({ automatica: false, x: 300, y: 200 });
    expect(rascunho!.cards.escala).toBe(2.5);
  });
});

describe('presets sempre à vista (D-928)', () => {
  it('saíram do menu e ficam na faixa do estilo', () => {
    expect(gruposDoModal('limpo')).not.toContain('presets');
    const html = renderToStaticMarkup(
      <PresetsNaFaixa
        presets={[{ id: 'p1', nome: 'Estúdio' } as never]}
        selecionado=""
        onAplicar={() => undefined}
        onRenomear={() => undefined}
        onRemover={() => undefined}
        renomeando={false}
        removendo={false}
      />,
    );
    expect(html).toContain('aria-label="Preset do estilo"');
    expect(html).toContain('Estúdio');
  });
});
