import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShortcutBinding } from '@/shared/atalhos/shortcuts';
import type { Corte } from '@/types/models';
import { UpgradeModal } from '@/upgrade/UpgradeModal';
import { lerNotaDoCorte } from '../notaDoCorte';
import { ConteudoDoPorQue, PorQueDoCorteModal } from '../PorQueDoCorteModal';
import { PorQueNaBancada } from '../PorQueNaBancada';
import { SeloDaNota } from '../SeloDaNota';

// D-886 · o selo "IA 22/30", o modal "por que a IA escolheu este corte" e o W
// das telas de um corte. Sem DOM não há clique: a sonda chama o componente,
// roda o passo da vez sobre o que ele devolveu e, se o passo mudou o estado,
// o React do servidor desenha de novo (render-phase update).
const h = vi.hoisted(() => ({
  portais: [] as { filho: ReactElement; alvo: unknown }[],
  atalhos: [] as ShortcutBinding[][],
}));

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (filho: ReactElement, alvo: unknown) => {
    h.portais.push({ filho, alvo });
    return filho;
  },
}));
vi.mock('@/shared/atalhos/shortcuts', async (original) => ({
  ...(await original<typeof import('@/shared/atalhos/shortcuts')>()),
  useShortcuts: (bindings: ShortcutBinding[]) => {
    h.atalhos.push(bindings);
  },
}));
// A avaliação do operador (D-419) busca e grava na API; aqui basta saber que abriu.
vi.mock('@/features/editor/avaliacao/AvaliacaoCorteModal', () => ({
  AvaliacaoCorteModal: (p: { corteId: string; descricao: string; onClose: () => void }) => (
    <div data-avaliacao={p.corteId}>{p.descricao}</div>
  ),
}));

const casca = { nome: '.ap' };
const corpo = { nome: 'body' };

afterEach(() => {
  vi.unstubAllGlobals();
  h.portais = [];
  h.atalhos = [];
});

const SCORE = { hook: 7, flow: 6, value: 8, total: 21 };

function corte(extra: Partial<Corte> = {}): Corte {
  return {
    id: 'c7',
    numero: 7,
    titulo_proposto: 'Pedro II e a Igreja',
    justificativa: 'Arco fechado: a tese abre e fecha em 9 minutos.',
    frase_gancho_texto: 'O imperador perdeu a Igreja antes do trono',
    frase_gancho_hms: '01:02:03',
    tema_central: 'Questão religiosa',
    score: SCORE,
    ...extra,
  } as unknown as Corte;
}

function encenar<P>(Componente: (p: P) => unknown, props: P, passos: ((saida: ReactElement) => void)[]) {
  const quadros: ReactElement[] = [];
  function Sonda() {
    const saida = Componente(props) as ReactElement;
    quadros.push(saida);
    passos[quadros.length - 1]?.(saida);
    return saida;
  }
  return { quadros, html: renderToStaticMarkup(<Sonda />) };
}

describe('SeloDaNota', () => {
  it('mostra a nota da IA num botão que abre o porquê', () => {
    const abrir = vi.fn();
    const html = renderToStaticMarkup(<SeloDaNota score={SCORE} onAbrir={abrir} />);
    expect(html).toMatch(/^<button type="button" title="Nota da IA 21\/30 \(Gancho 7 · Fluxo 6 · Valor 8\)/);
    expect(html).toContain('aria-label="Nota da IA 21/30. Ver por que a IA escolheu este corte"');
    expect(html).toContain('IA 21/30</span></button>');
    const botao = SeloDaNota({ score: SCORE, onAbrir: abrir }) as ReactElement<{ onClick: () => void }>;
    botao.props.onClick();
    expect(abrir).toHaveBeenCalledOnce();
  });

  it('a cor segue o tom da nota', () => {
    expect(renderToStaticMarkup(<SeloDaNota score={{ total: 26 }} onAbrir={vi.fn()} />)).toContain('var(--ok)');
    expect(renderToStaticMarkup(<SeloDaNota score={{ total: 18 }} onAbrir={vi.fn()} />)).toContain('var(--warn)');
  });

  it('sem nota, nada é desenhado', () => {
    expect(renderToStaticMarkup(<SeloDaNota score={{}} onAbrir={vi.fn()} />)).toBe('');
  });
});

describe('ConteudoDoPorQue', () => {
  const desenhar = (c: Corte) =>
    renderToStaticMarkup(<ConteudoDoPorQue corte={c} nota={lerNotaDoCorte(c.score)} />);

  it('a nota com as três barras, o porquê, a frase-gancho e o tema', () => {
    const html = desenhar(corte());
    expect(html).toContain('>21</span>');
    expect(html).toContain('de 30 · nota da IA');
    expect(html).toMatch(/title="O começo segura o scroll\?".*Gancho.*width:70%.*>7<\/span>/);
    expect(html).toMatch(/Fluxo.*width:60%.*Valor.*width:80%/);
    expect(html).toContain('Ranking entre os cortes desta live, não nota absoluta de qualidade.');
    expect(html).toContain('Por que virou corte</span><p');
    expect(html).toContain('Arco fechado: a tese abre e fecha em 9 minutos.');
    expect(html).toContain('Frase-gancho · 01:02:03');
    expect(html).toContain('“O imperador perdeu a Igreja antes do trono”');
    expect(html).toContain('Questão religiosa');
  });

  it('o que não veio não ganha bloco vazio', () => {
    const html = desenhar(
      corte({ score: {}, frase_gancho_texto: '  ', frase_gancho_hms: '', tema_central: '' }),
    );
    expect(html).not.toContain('nota da IA');
    expect(html).not.toContain('Frase-gancho');
    expect(html).not.toContain('Tema');
    expect(html).toContain('Arco fechado');
  });

  it('frase-gancho sem tempo não leva o separador', () => {
    expect(desenhar(corte({ frase_gancho_hms: '' }))).toContain('>Frase-gancho</span>');
  });

  it('sem justificativa, nota nem gancho, diz por quê', () => {
    const html = desenhar(corte({ score: {}, justificativa: '', frase_gancho_texto: '' }));
    expect(html).toContain('A IA não deixou justificativa nem nota para este corte');
    expect(html).not.toContain('Por que virou corte');
  });
});

describe('PorQueDoCorteModal', () => {
  it('abre por portal na casca, com o título do corte e a nota do operador no rodapé', () => {
    vi.stubGlobal('document', { querySelector: (s: string) => (s === '.ap' ? casca : null), body: corpo });
    const fechar = vi.fn();
    const { quadros, html } = encenar(PorQueDoCorteModal, { corte: corte(), aoFechar: fechar }, []);
    expect(h.portais[0].alvo).toBe(casca);
    const modal = quadros[0] as ReactElement<Record<string, unknown>>;
    expect(modal.type).toBe(UpgradeModal);
    expect(modal.props).toMatchObject({
      open: true,
      onClose: fechar,
      title: 'Por que a IA escolheu o corte #7',
      subtitle: 'Pedro II e a Igreja',
      secondaryLabel: 'Fechar',
      primaryLabel: 'Dar a minha nota',
      primaryStrong: false,
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Arco fechado');
  });

  it('sem a casca, vai para o body', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: corpo });
    encenar(PorQueDoCorteModal, { corte: corte(), aoFechar: vi.fn() }, []);
    expect(h.portais[0].alvo).toBe(corpo);
  });

  it('"Dar a minha nota" troca o porquê pela avaliação do operador (D-419)', () => {
    vi.stubGlobal('document', { querySelector: () => casca, body: corpo });
    const fechar = vi.fn();
    const { quadros, html } = encenar(PorQueDoCorteModal, { corte: corte(), aoFechar: fechar }, [
      (modal) => (modal.props as { onPrimary: () => void }).onPrimary(),
    ]);
    expect(quadros).toHaveLength(2);
    const avaliacao = quadros[1] as ReactElement<Record<string, unknown>>;
    expect(avaliacao.props).toMatchObject({ open: true, corteId: 'c7', onClose: fechar });
    expect(h.portais[1].alvo).toBe(casca);
    expect(html).toContain('data-avaliacao="c7"');
    expect(html).toContain('A sua nota, ao lado da que a IA deu');
    expect(html).not.toContain('role="dialog"');
  });
});

describe('PorQueNaBancada', () => {
  type Filhos = { props: { children: ReactElement<Record<string, unknown>>[] } };
  const pecas = (saida: ReactElement) => (saida as unknown as Filhos).props.children;

  // D-887: o W lê se há outro diálogo na tela; só a casca responde aqui.
  const soACasca = { querySelector: (s: string) => (s === '.ap' ? casca : null), body: corpo };

  it('W (do registro) abre e fecha o porquê; o selo também abre', () => {
    vi.stubGlobal('document', soACasca);
    const { quadros } = encenar(PorQueNaBancada, { corte: corte() }, [
      () => h.atalhos[0][0].action(),
      (saida) => (pecas(saida)[1].props.aoFechar as () => void)(),
      (saida) => (pecas(saida)[0].props.onAbrir as () => void)(),
    ]);
    expect(h.atalhos[0]).toHaveLength(1);
    expect(h.atalhos[0][0]).toMatchObject({ key: 'w', group: 'global' });
    expect(h.atalhos[0][0].mod).toBeUndefined();
    expect(quadros).toHaveLength(4);
    const modal = (i: number) => pecas(quadros[i])[1];
    expect(modal(0)).toBeNull();
    expect(modal(1).type).toBe(PorQueDoCorteModal);
    expect(modal(1).props.corte).toMatchObject({ id: 'c7' });
    expect(modal(2)).toBeNull();
    expect(modal(3).type).toBe(PorQueDoCorteModal);
    expect(pecas(quadros[0])[0].type).toBe(SeloDaNota);
    expect(pecas(quadros[0])[0].props.score).toBe(SCORE);
  });

  it('o W alterna: com o porquê aberto, fecha', () => {
    vi.stubGlobal('document', soACasca);
    const { quadros } = encenar(PorQueNaBancada, { corte: corte() }, [
      () => h.atalhos[0][0].action(),
      () => h.atalhos[0][0].action(),
    ]);
    expect(quadros).toHaveLength(3);
    expect(pecas(quadros[2])[1]).toBeNull();
  });

  // D-887: com modal aberto o editor cala as teclas sem Ctrl. O W é a exceção
  // — ele fecha o próprio porquê —, mas não abre por cima de outro diálogo.
  it('o W vale com modal aberto, para fechar o próprio porquê', () => {
    vi.stubGlobal('document', soACasca);
    encenar(PorQueNaBancada, { corte: corte() }, []);
    expect(h.atalhos[0][0].valeComModal).toBe(true);
  });

  it('com outro diálogo aberto (os metadados), o W não empilha o porquê', () => {
    vi.stubGlobal('document', { querySelector: () => casca, body: corpo });
    const { quadros } = encenar(PorQueNaBancada, { corte: corte() }, [
      () => h.atalhos[0][0].action(),
    ]);
    expect(pecas(quadros.at(-1)!)[1]).toBeNull();
  });
});
