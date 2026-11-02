import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// D-1008: as funções do aviso têm o seu teste; este fixa a ligação com a tela.
// Sem ele, desfazer a chamada em EditorFase1 ou useEditorPage passava em branco.

// A bancada só interessa pelo que entrega ao player: o selo.
vi.mock('../fase1/PlayerPanel', () => ({ PlayerPanel: ({ selo }: { selo: string }) => selo }));
vi.mock('../fase1/TimelinePanel', () => ({ TimelinePanel: () => null }));
vi.mock('../fase1/RightTabsPanel', () => ({ RightTabsPanel: () => null }));

const { EditorFase1 } = await import('../fase1/EditorFase1');

describe('D-1008 · o aviso do bruto chega à tela', () => {
  it('a bancada entrega ao player o selo do status real', () => {
    const props = {
      corte: { inicio_seg: 0, fim_seg: 60, desvios: [] },
      brutoPronto: true,
      brutoStatus: { status: 'cortando' },
      pending: {},
    } as unknown as Parameters<typeof EditorFase1>[0];
    expect(renderToStaticMarkup(<EditorFase1 {...props} />)).toContain('BRUTO · processando…');
  });

  it('o editor pergunta "ocupado?" por quem avisa, nas duas portas do gesto', () => {
    // O hook da página depende de roteador e de uma dúzia de consultas; a
    // ligação se confere na fonte, como nos outros testes de acordo do editor.
    const fonte = readFileSync(resolve(__dirname, '../useEditorPage.tsx'), 'utf8');
    expect(fonte).toMatch(/const brutoOcupado = \(\) =>\s+!corteId \|\| avisarSeBrutoOcupado\(/);
    expect(fonte.match(/if \(brutoOcupado\(\)\) return;/g)).toHaveLength(2);
  });
});
