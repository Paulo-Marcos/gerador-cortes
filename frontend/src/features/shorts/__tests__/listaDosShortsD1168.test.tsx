import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import { luzDaSala } from '@/upgrade/luzDaSala';
import { itensDoMenuDoFire } from '../acoesDoFire';
import { ConteudoDosShorts, type EstadoDosShorts } from '../ShortsPage';
import { seloDoFire } from '../seloDoFire';
import type { FireComBruto } from '../shortsApi';

// D-1168 (E-069 H-20; DIRECAO §7.6): a lista de shorts na Sala escura.
// Pedido → teste: agrupada por live · nenhuma primária · chips com o zero à vista · um selo
// por linha · "Gerar com IA" e "Finalizar" no ⋯ · sem `style` inline · Curadoria sem blur.

const fire = (extra: Partial<FireComBruto>): FireComBruto =>
  ({
    corte_id: 'c1',
    numero: 1,
    titulo: 'O corte um',
    projeto_id: 'p1',
    projeto_titulo: 'Live de terça',
    tema_central: '',
    duracao_seg: 95,
    bruto_mb: 42,
    tem_bruto: true,
    live_em_disco: true,
    is_fire: true,
    indicado: false,
    finalizado_em: null,
    tem_edicao: false,
    tem_video_final: false,
    redes: [],
    shorts: { total: 3, sugerido: 3, aprovado: 0, rejeitado: 0, renderizado: 0 },
    ...extra,
  }) as FireComBruto;

const FIRES = [
  fire({ corte_id: 'a', numero: 1, titulo: 'Primeiro da terça' }),
  fire({ corte_id: 'b', numero: 2, titulo: 'Segundo da terça', shorts: { total: 2, sugerido: 0, aprovado: 1, rejeitado: 0, renderizado: 1 } }),
  fire({ corte_id: 'c', numero: 1, titulo: 'Único da quinta', projeto_id: 'p2', projeto_titulo: 'Live de quinta', tem_bruto: false }),
];

function montar(parte: Partial<EstadoDosShorts> = {}) {
  const estado: EstadoDosShorts = { fires: FIRES, andamento: [], carregando: false, filtro: 'todos', busca: '', ...parte };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ConteudoDosShorts estado={estado} acoes={{ aoFiltrar: () => undefined, aoBuscar: () => undefined, aoLimpar: () => undefined }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('D-1168 · a lista de shorts', () => {
  it('agrupa por live: uma faixa por live, com as linhas dos seus cortes embaixo', () => {
    const html = montar();
    const secoes = html.split('<section ').slice(1);
    expect(secoes).toHaveLength(2);
    expect(secoes[0]).toContain('Live de terça');
    expect(secoes[0]).toContain('2 cortes na fábrica');
    expect(secoes[0]).toContain('Primeiro da terça');
    expect(secoes[0]).toContain('Segundo da terça');
    expect(secoes[0]).not.toContain('Único da quinta');
    expect(secoes[1]).toContain('1 corte na fábrica');
    expect(secoes[1]).toContain('Único da quinta');
  });

  it('não tem botão primário: a tela é de escolha (régua D-1138)', () => {
    esperarPrimarios(montar(), 'Shorts');
    esperarPrimarios(montar({ fires: [] }), 'Shorts');
    esperarPrimarios(montar({ carregando: true }), 'Shorts');
    esperarPrimarios(montar({ erro: 'falhou' }), 'Shorts');
  });

  it('o chip sem corte fica desabilitado com o zero à vista; o resto, aceso', () => {
    const html = montar();
    const chip = (rotulo: string) => [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)].map((m) => m[0]).find((b) => b.includes(rotulo));
    expect(chip('Finalizados')).toMatch(/\sdisabled(=|\s|>)/);
    expect(chip('Finalizados')).toContain('>0<');
    expect(chip('Todos')).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(chip('Todos')).toContain('aria-pressed="true"');
  });

  it('cada linha leva exatamente um selo, e as ações de texto são "Abrir workspace" e o ⋯', () => {
    const html = montar();
    expect(html.match(/data-tom="/g)).toHaveLength(FIRES.length);
    expect(html.match(/Abrir workspace/g)).toHaveLength(FIRES.length);
    expect(html.match(/aria-label="Mais ações do corte/g)).toHaveLength(FIRES.length);
  });

  it('a capa do short é 9:16 e nunca distorce', () => {
    expect(montar()).toContain('data-proporcao="9/16"');
  });

  it('desenha os quatro estados: carregando, erro, vazio da fábrica e vazio do filtro', () => {
    expect(montar({ carregando: true })).toContain('Procurando os Fires');
    expect(montar({ erro: 'sem rede' })).toContain('sem rede');
    expect(montar({ fires: [] })).toContain('Nenhum corte na fábrica de shorts');
    const semResultado = montar({ busca: 'xyzxyz' });
    expect(semResultado).toContain('Nenhum corte com este recorte');
    expect(semResultado).toContain('Ver todos de novo');
  });

  it('sem `style` inline e com `data-sala` nos controles da sala', () => {
    const html = montar();
    // `--cols` da Lista e o `flex-shrink:0` do <Icon> (upgrade/Icon.tsx, fora do escopo) são geometria de execução (a própria Lista a declara), não aparência.
    expect(html.match(/\sstyle="[^"]*"/g)?.filter((s) => !s.includes('--cols') && !s.includes('flex-shrink:0'))).toEqual([]);
    expect(html).toContain('data-sala=""');
  });

  it('o disparo da live fica na faixa; com live rodando, a faixa mostra o andamento', () => {
    expect(montar()).toContain('Gerar o que falta');
    const rodando = montar({
      andamento: [{ projeto_id: 'p1', etapa: 'gerando', feitos: 0, total: 2, erros: [] } as never],
    });
    expect(rodando).toContain('Gerando 1 de 2…');
  });
});

describe('D-1168 · o selo da linha', () => {
  it.each([
    [{ finalizado_em: '2026-11-05' }, 'ok', 'Finalizado'],
    [{ tem_bruto: false }, 'convite', 'Sem bruto'],
    [{ shorts: { total: 2, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 1 } }, 'convite', 'Tem pronto'],
    [{ tem_edicao: true }, 'neutro', 'Em curadoria'],
    [{}, 'inerte', 'Não comecei'],
    [{ shorts: { total: 0, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 0 } }, 'inerte', 'Sem candidatos'],
  ] as const)('%j → %s "%s"', (extra, tom, rotulo) => {
    const s = seloDoFire(fire(extra as Partial<FireComBruto>));
    expect([s.tom, s.rotulo]).toEqual([tom, rotulo]);
  });
});

describe('D-1168 · o ⋯ da linha', () => {
  const acoes = { editar: () => undefined, alternarFinalizado: () => undefined, gerar: () => undefined, liveRodando: false, marcando: false };

  it('oferece editar, finalizar e gerar com IA', () => {
    expect(itensDoMenuDoFire(fire({}), acoes).map((i) => i.label)).toEqual(['Editar a curadoria', 'Finalizar', 'Gerar shorts com IA']);
  });

  it('finalizado oferece reabrir e esconde o gerar', () => {
    expect(itensDoMenuDoFire(fire({ finalizado_em: '2026-11-05' }), acoes).map((i) => i.label)).toEqual(['Editar a curadoria', 'Reabrir']);
  });

  it('sem bruto, o rótulo promete o bruto; sem bruto e sem a live em disco, desabilita', () => {
    const [, , gerar] = itensDoMenuDoFire(fire({ tem_bruto: false, live_em_disco: false }), acoes);
    expect(gerar.label).toBe('Gerar bruto e shorts com IA');
    expect(gerar.disabled).toBe(true);
  });

  it('live rodando em lote desabilita o gerar do corte', () => {
    const [, , gerar] = itensDoMenuDoFire(fire({}), { ...acoes, liveRodando: true });
    expect(gerar.disabled).toBe(true);
  });
});

describe('D-1168 · a luz da Curadoria', () => {
  const sala = { temCapa: true, reduzirEfeitos: false, transparenciaReduzida: false, foco: false };

  it('a Curadoria toca vídeo: aurora só nos halos e vidro sólido, sem blur (§3.6)', () => {
    expect(luzDaSala({ ...sala, tela: 'fire' })).toEqual({ aurora: 'halos', vidro: false });
  });

  it('a lista de Shorts não toca vídeo: segue com a aurora da capa', () => {
    expect(luzDaSala({ ...sala, tela: 'shorts' })).toEqual({ aurora: 'capa', vidro: true });
  });
});
