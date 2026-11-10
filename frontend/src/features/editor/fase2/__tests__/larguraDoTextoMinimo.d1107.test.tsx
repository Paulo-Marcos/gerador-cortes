import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AjustesDosCards, LARGURA_MINIMA_DO_TEXTO, larguraDoTextoConfirmada, type CardsEditaveis } from '@/features/channels/CardsDoCanal';
import { rascunhoDe } from '@/features/channels/PalcoComponentesSection';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { PainelDoPalco } from '../PaineisDoPalco';

// D-1107: o mínimo da largura do texto aparece na tela (o servidor prende 1..239 em
// 240), e o painel de Cards do modal empilha os campos e não rola de lado — testes
// que desfeitos a mão ficam vermelhos (os da D-1102 não pegavam).

const cards = (largura_do_texto = 0): CardsEditaveis => ({
  ocultos: [],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  ajuste: 'preencher',
  alinhamento_vertical: 'centro',
  alinhamento_horizontal: 'centro',
  largura_do_texto,
});

describe('largura do texto: o mínimo é dito e aplicado à vista (D-1107)', () => {
  it('o mínimo é o do servidor (240) e a dica o diz', () => {
    expect(LARGURA_MINIMA_DO_TEXTO).toBe(240);
    const html = renderToStaticMarkup(<AjustesDosCards valor={cards()} onMudar={() => undefined} />);
    expect(html).toContain('mínimo 240');
  });

  it('zero segue automática; de 1 a 239 vira o mínimo; o resto passa', () => {
    expect(larguraDoTextoConfirmada(0)).toBe(0);
    expect(larguraDoTextoConfirmada(1)).toBe(LARGURA_MINIMA_DO_TEXTO);
    expect(larguraDoTextoConfirmada(239.4)).toBe(LARGURA_MINIMA_DO_TEXTO);
    expect(larguraDoTextoConfirmada(240)).toBe(240);
    expect(larguraDoTextoConfirmada(1100.4)).toBe(1100);
  });
});

function painel() {
  const efetivo = {
    canal_id: 'default',
    estilo: 'limpo',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora'],
    cabecalho: { ativo: true, nome: '', handle: '', imagem: '', nome_efetivo: 'Seu Canal', handle_efetivo: '@c', imagem_url: '', escala: 1, posicao: { automatica: true, x: 0, y: 0 }, posicao_short: { automatica: true, x: 0, y: 0 }, mostrar_imagem: true, mostrar_nome: true, mostrar_handle: true },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 }, zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 } },
    tipos_de_cena: [{ id: 'citacao_autor', nome: 'Citação' }],
  } as unknown as PalcoComponentes;
  const modal = { efetivo, rascunho: rascunhoDe(efetivo), estilo: 'limpo', mudar: () => undefined } as unknown as ReturnType<typeof usePalcoDoModal>;
  return renderToStaticMarkup(
    <MemoryRouter>
      <PainelDoPalco grupo="cards" palco={modal} global={false} editavel fundo="hud-forte" placa={{ nome: '', papel: '' }} onFundo={() => undefined} onPlaca={() => undefined} />
    </MemoryRouter>,
  );
}

describe('painel de Cards do modal (D-1107)', () => {
  it('a grade que leva tamanho e caixa tem uma coluna só, sem a de duas do breakpoint sm', () => {
    const html = painel();
    const antes = html.slice(0, html.indexOf('palco-cards-tamanho'));
    const grade = antes.match(/<div class="grid gap-3[^"]*"/g)?.pop() ?? '';
    expect(grade).toContain('grid-cols-1');
    expect(grade).not.toContain('sm:grid-cols-2');
  });

  it('a coluna de ajustes do modal corta o excesso lateral em vez de rolar de lado', () => {
    const fonte = readFileSync(new URL('../PosicionamentoModal.tsx', import.meta.url), 'utf8');
    const coluna = fonte.match(/minmax\(0,300px\)[^\n]*\n\s*<MenuDoModal[^\n]*\n\s*<div className="([^"]*)"/);
    expect(coluna?.[1]).toContain('overflow-x-hidden');
    expect(coluna?.[1]).toContain('overflow-y-auto');
  });
});
