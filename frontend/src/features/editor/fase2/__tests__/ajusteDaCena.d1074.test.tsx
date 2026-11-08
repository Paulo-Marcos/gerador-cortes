import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { conferenciaDaOrigemKey, corteKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { AjusteDaCena, CartaoDoAjuste, type CartaoDoAjusteProps } from '../AjusteDaCena';
import { CenaComOrigem } from '../CenaComOrigem';
import {
  aceitaAjuste,
  aceiteDa,
  camposQueMudaram,
  estadoDoCartao,
  jobDoAjuste,
  motivoParaNaoAceitar,
  motivoParaNaoAjustar,
  type PropostaDeAjuste,
} from '../regrasDoAjuste';
import type { AjusteDoCorte } from '../useAjusteDaCena';

// D-1074 (RN-40): no card da cena selecionada, "Pedir ajuste desta cena à IA". A resposta
// é uma proposta com o antes e o depois; só o Aceitar grava, e só aquela cena. A cena
// manual e a riscada não recebem ajuste; enquanto a IA trabalha, o card oferece cancelar.

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/shared/api', async (original) => ({
  ...(await original<typeof import('@/shared/api')>()),
  api: { POST: post, GET: vi.fn() },
  dados: (resposta: unknown) => resposta,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

const DA_IA = { tipo: 'enfase', texto: 'Uma frase longa demais', inicio: 20, fim: 24 } as CenaRemotion;
const PROPOSTA: PropostaDeAjuste = {
  versao: 'v7',
  provider: 'claude',
  antes: { ...DA_IA, inicio_seg: 20, fim_seg: 24, motivo: 'velho' },
  depois: { ...DA_IA, texto: 'Curta', inicio_seg: 20, fim_seg: 24, motivo: 'novo' },
};

const cartao = (props: Partial<CartaoDoAjusteProps>) =>
  renderToStaticMarkup(
    <CartaoDoAjuste
      proposta={null}
      pedindo={false}
      cancelando={false}
      aceitando={false}
      bloqueio={null}
      motivoParaNaoAceitar={null}
      pedir={vi.fn()}
      cancelar={vi.fn()}
      aceitar={vi.fn()}
      descartar={vi.fn()}
      {...props}
    />,
  );

const ajusteDoCorte = (campos: Partial<AjusteDoCorte> = {}): AjusteDoCorte => ({
  alvo: null,
  proposta: null,
  pedindo: false,
  cancelando: false,
  aceitando: false,
  pedir: vi.fn(),
  cancelar: vi.fn(),
  aceitar: vi.fn(),
  descartar: vi.fn(),
  ...campos,
});

describe('o pedido de ajuste no card', () => {
  it('mostra o campo e o botão do desenho da Pós', () => {
    const saida = cartao({});
    expect(saida).toContain('Pedir ajuste desta cena à IA');
    expect(saida).toContain('placeholder="ex.: encurte para caber em duas linhas"');
    expect(saida).toContain('Pedir ajuste');
  });

  it('não deixa pedir com o campo vazio', () => {
    expect(cartao({})).toMatch(/type="submit" disabled=""/);
  });

  it('diz por que não pode pedir agora', () => {
    const saida = cartao({ bloqueio: 'Salve as cenas antes de pedir um ajuste.' });
    expect(saida).toContain('Salve as cenas antes de pedir um ajuste.');
    expect(saida).toMatch(/type="submit" disabled=""/);
  });

  it('enquanto a IA trabalha, mostra que está pedindo e oferece cancelar', () => {
    const saida = cartao({ pedindo: true });
    expect(saida).toContain('Pedindo o ajuste desta cena à IA…');
    expect(saida).toContain('Cancelar');
    expect(saida).not.toContain('Pedir ajuste desta cena à IA');
  });

  it('cancelando, o botão trava', () => {
    expect(cartao({ pedindo: true, cancelando: true })).toMatch(/disabled=""[^>]*>Cancelando…/);
  });
});

describe('a proposta: antes e depois, Aceitar e Descartar', () => {
  it('mostra quem propôs, o antes riscado e o depois do que mudou', () => {
    const saida = cartao({ proposta: PROPOSTA });
    expect(saida).toContain('Proposta do Claude');
    expect(saida).toContain('<s>Uma frase longa demais</s>');
    expect(saida).toContain('Curta');
    expect(saida).toContain('Aceitar');
    expect(saida).toContain('Descartar');
    expect(saida).toContain('Aceitar troca só esta cena e desfaz a validação do plano.');
    expect(saida).not.toContain('velho');
  });

  it('com o plano sujo, o Aceitar trava e diz por quê', () => {
    const saida = cartao({ proposta: PROPOSTA, motivoParaNaoAceitar: motivoParaNaoAceitar(true) });
    expect(saida).toContain('Há mudanças sem salvar no plano.');
    expect(saida).toMatch(/disabled=""[^>]*>.*Aceitar<\/button>/);
  });

  it('diz quando a IA devolveu a cena igual', () => {
    expect(cartao({ proposta: { ...PROPOSTA, depois: PROPOSTA.antes } })).toContain('A IA devolveu a cena sem mudanças.');
  });
});

describe('onde o cartão aparece', () => {
  it('no card da cena selecionada, e só nele', () => {
    const base = { cena: DA_IA, alvo: null, pedindo: false, temProposta: false };
    expect(estadoDoCartao({ ...base, ativa: true })).toBe('pedido');
    expect(estadoDoCartao({ ...base, ativa: false })).toBe('oculto');
  });

  it('o ajuste em voo e a proposta ficam no card da cena, mesmo que o vídeo saia dela', () => {
    const alvo = { tipo: 'enfase', inicio: 20 };
    expect(estadoDoCartao({ cena: DA_IA, ativa: false, alvo, pedindo: true, temProposta: false })).toBe('pedindo');
    expect(estadoDoCartao({ cena: DA_IA, ativa: false, alvo, pedindo: false, temProposta: true })).toBe('proposta');
  });

  it('a proposta de outra cena não aparece neste card', () => {
    const alvo = { tipo: 'enfase', inicio: 40 };
    expect(estadoDoCartao({ cena: DA_IA, ativa: true, alvo, pedindo: false, temProposta: true })).toBe('pedido');
  });

  it('o outro card, com um ajuste em voo no corte, diz para esperar', () => {
    const saida = renderToStaticMarkup(
      <AjusteDaCena
        ajuste={ajusteDoCorte({ pedindo: true, alvo: { tipo: 'enfase', inicio: 40 } })}
        cena={DA_IA}
        ativa
        dirty={false}
        emGeracao={false}
      />,
    );
    expect(saida).toContain('Outra cena deste corte está sendo ajustada.');
  });

  it('cena manual e cena riscada não recebem ajuste', () => {
    expect(aceitaAjuste('conferida')).toBe(true);
    expect(aceitaAjuste('conferir')).toBe(true);
    expect(aceitaAjuste('manual')).toBe(false);
    expect(aceitaAjuste('riscada')).toBe(false);
  });

  it('o painel só monta o cartão nas cenas que aceitam ajuste', () => {
    const fonte = readFileSync(resolve(__dirname, '../CenasPanel.tsx'), 'utf8');
    expect(fonte).toContain('ajuste={aceitaAjuste(origens[idx]) && <AjusteDaCena');
    expect(fonte).toContain('desabilitado={ajuste.pedindo}');
  });

  it('o card da cena mostra o cartão que recebe, e a riscada não o mostra', () => {
    const qc = new QueryClient();
    qc.setQueryData(corteKey('c1'), { id: 'c1' });
    qc.setQueryData(conferenciaDaOrigemKey('c1', qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0), { avisos: [] });
    const card = (origem: 'conferida' | 'riscada') =>
      renderToStaticMarkup(
        <QueryClientProvider client={qc}>
          <CenaComOrigem
            corteId="c1"
            cena={DA_IA}
            origem={origem}
            ativa
            sobreposta={false}
            onChange={vi.fn()}
            onRiscar={vi.fn()}
            onTrazerDeVolta={vi.fn()}
            onSeek={vi.fn()}
            ajuste={<p>CARTAO-DO-AJUSTE</p>}
          />
        </QueryClientProvider>,
      );
    expect(card('conferida')).toContain('CARTAO-DO-AJUSTE');
    expect(card('riscada')).not.toContain('CARTAO-DO-AJUSTE');
  });
});

describe('as regras do ajuste', () => {
  it('o plano sem salvar vem antes da geração e do outro ajuste', () => {
    expect(motivoParaNaoAjustar({ dirty: true, emGeracao: true, outroAjusteEmVoo: true })).toContain('Salve');
    expect(motivoParaNaoAjustar({ dirty: false, emGeracao: true, outroAjusteEmVoo: true })).toContain('geradas');
    expect(motivoParaNaoAjustar({ dirty: false, emGeracao: false, outroAjusteEmVoo: false })).toBeNull();
    expect(motivoParaNaoAceitar(false)).toBeNull();
  });

  it('o aceite manda a versão do pedido, a cena pela identidade e a nova', () => {
    expect(aceiteDa(PROPOSTA)).toEqual({ versao: 'v7', tipo: 'enfase', inicio: 20, depois: PROPOSTA.depois });
  });

  it('o antes e o depois só listam o que mudou, sem o par _seg nem o motivo', () => {
    const mudou = camposQueMudaram(
      { tipo: 'enfase', texto: 'A', inicio: 20, inicio_seg: 20, motivo: 'x' },
      { tipo: 'enfase', texto: 'B', inicio: 21.5, inicio_seg: 21.5, motivo: 'y', fonte: 'Livro' },
    );
    expect(mudou.map((m) => [m.rotulo, m.antes, m.depois])).toEqual([
      ['Texto', 'A', 'B'],
      ['Fonte', '—', 'Livro'],
      ['Início', '20', '21.5'],
    ]);
  });

  it('cancelar mira o ajuste deste corte na fila global', () => {
    expect(jobDoAjuste('c1')).toBe('ajuste:c1');
  });
});

describe('as chamadas à API', () => {
  it('pedir manda a cena pela identidade e o pedido, sem provedor: quem escolhe é o servidor', async () => {
    const { geracaoIaApi } = await import('@/features/ia');
    await geracaoIaApi.ajustarCena('c1', { tipo: 'enfase', inicio: 20, pedido: 'encurte' });
    expect(post).toHaveBeenLastCalledWith('/api/claude/corte/{corte_id}/ajustar-cena', {
      params: { path: { corte_id: 'c1' } },
      body: { tipo: 'enfase', inicio: 20, pedido: 'encurte' },
    });
  });

  it('aceitar manda a versão e a cena ajustada', async () => {
    const { cenasApi } = await import('../../api/cenas');
    await cenasApi.aceitarAjuste('c1', aceiteDa(PROPOSTA));
    expect(post).toHaveBeenLastCalledWith('/api/cortes/{corte_id}/cenas-remotion/ajuste/aceitar', {
      params: { path: { corte_id: 'c1' } },
      body: aceiteDa(PROPOSTA),
    });
  });

  it('cancelar vai pela rota da fila global, com o id do ajuste', async () => {
    const { filaGlobalApi } = await import('@/shared/filaGlobal/api');
    await filaGlobalApi.cancelarJob(jobDoAjuste('c1'));
    expect(post).toHaveBeenLastCalledWith('/api/export/fila-global/cancelar', { body: { job_id: 'ajuste:c1' } });
  });

  it('o hook cancela pelo id do ajuste deste corte', () => {
    const fonte = readFileSync(resolve(__dirname, '../useAjusteDaCena.ts'), 'utf8');
    expect(fonte).toContain('filaGlobalApi.cancelarJob(jobDoAjuste(corteId))');
  });
});
