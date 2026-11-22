import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { ScreenHeader } from '@/upgrade/ScreenHeader';
import { ConteudoDaBiblioteca, type EstadoDaBiblioteca } from '../BibliotecaPage';
import { cortesDoMapa, diasDaRegua, esperandoVoce, noArHaPouco, saudacao } from '../regrasDaBiblioteca';
import { consultaDoOperador, useNomeDoOperador } from '../useSalaDaBiblioteca';
import { corte, projeto } from './fixtures/projetoDaSala';

// D-1148 (E-069 H-15; DIRECAO §5, §7.1, §7.12 e §8.2): a Biblioteca nos quatro estados.
//
// A primária única se prova contando `data-variant="primario"`, que é o que o Button da
// sala grava. A catraca `umPrimarioPorTela` conta `"primary"` e está quebrada (D-1138);
// quando ela for corrigida, esta tela passa a chamar `esperarPrimarios` também.

const contarPrimarios = (html: string) => (html.match(/data-variant="primario"/g) ?? []).length;

function montar(estado: EstadoDaBiblioteca) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ConteudoDaBiblioteca estado={estado} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const nada = () => undefined;
const HOJE = new Date(2026, 10, 20, 21);
const CASA = [
  projeto({ id: 'destaque', titulo_live: 'A live do destaque', data_live: '20261120', total_cortes: 6 }),
  projeto({ id: 'espera', titulo_live: 'Outra live', data_live: '20261118', total_cortes: 2, total_aprovados: 1 }),
  projeto({ id: 'noar', titulo_live: 'A que subiu', data_live: '20261116', total_cortes: 1, total_publicados: 1 }),
];

function cheio(verTodas = false): EstadoDaBiblioteca {
  const destaque = CASA[0];
  return {
    tipo: 'cheio',
    projetos: CASA,
    verTodas,
    onVoltar: nada,
    sala: {
      total: CASA.length,
      destaque,
      cortesDoDestaque: cortesDoMapa([corte({ id: 'c1', status: 'aprovado' }), corte({ id: 'c2', numero: 2 })], destaque.id),
      destino: '@sapo',
      dias: diasDaRegua(CASA, HOJE),
      esperando: esperandoVoce(CASA, destaque.id),
      noAr: noArHaPouco(CASA),
      ir: nada,
      onVerTodas: nada,
    },
  };
}

const VAZIO: EstadoDaBiblioteca = { tipo: 'vazio', onBuscarLives: nada, onLigarCanal: nada };

describe('Biblioteca cheia (§7.1)', () => {
  const html = montar(cheio());

  it('tem UMA primária: o próximo passo da live do "Continue"', () => {
    expect(contarPrimarios(html)).toBe(1);
    expect(html).toMatch(/data-variant="primario"[^>]*>(<[^>]*>)*Revisar 6 cortes/);
  });

  it('o "Continue" leva o fio de luz, um selo, o mini-mapa, "Abrir a live" e o destino', () => {
    const continua = html.slice(html.indexOf('aria-label="Continue de onde parou"'), html.indexOf('Os últimos 8 dias'));
    expect(continua).toContain('cc-fio');
    expect(continua).toContain('A live do destaque');
    expect((continua.match(/data-tom="/g) ?? []).length).toBe(1);
    expect(continua).toContain('aria-label="Mapa da live"');
    expect(continua).toMatch(/data-variant="fantasma"[^>]*>Abrir a live/);
    expect(continua).toContain('Vai ao ar em @sapo');
    expect(continua).toContain('etapas da live');
  });

  it('só um cartão da tela tem o fio de luz', () => {
    expect((html.match(/data-fio-de-luz/g) ?? []).length).toBe(1);
  });

  it('a régua tem os oito dias, com a casa tracejada no dia sem live', () => {
    expect(html).toContain('Os últimos 8 dias');
    expect((html.match(/data-dia="/g) ?? []).length).toBe(8);
    expect(html).toMatch(/data-dia="2026-11-18" data-tem-live="sim"/);
    expect(html).toMatch(/data-dia="2026-11-19" data-tem-live="nao"/);
  });

  it('"Esperando você" e "No ar há pouco", e o caminho para a lista inteira', () => {
    expect(html).toContain('Esperando você');
    expect(html).toContain('Outra live');
    expect(html).toContain('No ar há pouco');
    expect(html).toContain('A que subiu');
    expect(html).toContain('Ver as 3 lives');
  });

  it('cada cartão tem um selo e uma ação de texto; o resto mora no ⋯', () => {
    const cartao = html.slice(html.indexOf('aria-label="Outra live"'), html.indexOf('No ar há pouco'));
    expect((cartao.match(/data-tom="/g) ?? []).length).toBe(1);
    expect((cartao.match(/data-variant="link-de-acao"/g) ?? []).length).toBe(1);
    expect(cartao).toContain('Mais ações da live Outra live');
    expect(cartao).not.toContain('Remover projeto');
  });
});

describe('a lista inteira ("Ver as N lives")', () => {
  it('tem os chips de filtro e a grade, sem primária (é tela de escolha)', () => {
    const html = montar(cheio(true));
    expect(html).toContain('Todas as lives');
    expect(html).toMatch(/aria-pressed="(true|false)"[^>]*>(<[^>]*>)*Não publicados/);
    expect(contarPrimarios(html)).toBe(0);
  });
});

describe('Biblioteca vazia, canal novo (§7.12)', () => {
  const html = montar(VAZIO);

  it('"Cole o link" com "Baixar a live" como a única primária', () => {
    expect(html).toContain('Cole o link de uma live do YouTube');
    expect(contarPrimarios(html)).toBe(1);
    expect(html).toMatch(/data-variant="primario"[^>]*>(<[^>]*>)*Baixar a live/);
    expect(html).toContain('Ou buscar as lives do canal-fonte');
  });

  it('o caminho em três passos e o lembrete do canal de destino', () => {
    expect(html).toContain('Ela baixa e transcreve');
    expect(html).toContain('A IA propõe os cortes');
    expect(html).toContain('Você aprova e publica');
    expect(html).toContain('ligue o canal de destino');
    expect(montar({ ...VAZIO, destino: '@sapo' } as EstadoDaBiblioteca)).toContain('Os cortes vão ao ar em @sapo.');
  });
});

describe('carregando e erro (§3.4)', () => {
  it('carregando diz o que busca, em role="status"', () => {
    const html = montar({ tipo: 'carregando' });
    expect(html).toContain('role="status"');
    expect(html).toContain('Buscando as lives…');
    expect(contarPrimarios(html)).toBe(0);
  });

  it('erro diz o motivo e oferece tentar de novo, em role="alert"', () => {
    const html = montar({ tipo: 'erro', motivo: 'O backend não respondeu.', tentar: nada });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não deu para carregar as lives');
    expect(html).toContain('O backend não respondeu.');
    expect(html).toContain('Tentar de novo');
  });
});

describe('a saudação usa o nome do operador (GET /api/operador, D-1129)', () => {
  function Saudacao() {
    return <>{saudacao(21, useNomeDoOperador())}</>;
  }
  const comNome = (nome?: string) => {
    const qc = new QueryClient();
    if (nome !== undefined) qc.setQueryData(consultaDoOperador.queryKey, { nome });
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Saudacao />
      </QueryClientProvider>,
    );
  };

  it('com nome, "Boa noite, Paulo."; sem nome (ou sem resposta), "Boa noite."', () => {
    expect(comNome('Paulo Marcos')).toBe('Boa noite, Paulo.');
    expect(comNome('')).toBe('Boa noite.');
    expect(comNome()).toBe('Boa noite.');
  });

  it('o nome vai no feixe do h1, pelo ScreenHeader', () => {
    const h1 = renderToStaticMarkup(<ScreenHeader titulo={saudacao(21, 'Paulo')} />);
    expect(h1).toMatch(/<h1[^>]*>Boa noite, <span class="[^"]*text-feixe[^"]*">Paulo\.<\/span><\/h1>/);
  });
});

describe('a roupa da sala (§8.2)', () => {
  const telas = [montar(cheio()), montar(cheio(true)), montar(VAZIO), montar({ tipo: 'carregando' })];
  const FONTES = [
    'BibliotecaPage', 'SalaDaBiblioteca', 'CartaoContinue', 'CartaoComFio', 'CanalNovo', 'ListaCompleta',
    'ProjetoCardAp', 'CapaDoProjetoCard', 'NovoProjetoForm', 'RedesDoProjeto',
  ].map((n) => readFileSync(resolve(__dirname, '..', `${n}.tsx`), 'utf8'));

  it('nenhum style de aparência: só a geometria por variável CSS (--p, --inicio)', () => {
    // A lista inteira fica de fora do HTML: o Select do Radix escreve o próprio `style` (o
    // `<select>` escondido para o leitor de tela). O `<svg>` do Icon compartilhado leva
    // `flex-shrink:0`. Nenhum dos dois é desta tela; a fonte dela está coberta logo abaixo.
    for (const html of [telas[0], telas[2], telas[3]]) {
      for (const [, estilo] of html.matchAll(/<(?!svg)[a-z]+[^>]* style="([^"]*)"/g)) {
        expect(estilo.split(';').filter((d) => d && !d.trim().startsWith('--'))).toEqual([]);
      }
    }
    for (const fonte of FONTES) expect(fonte).not.toMatch(/style=\{\{/);
  });

  it('a escala de fonte, sem px à mão, sem tokens antigos nem o .btn legado', () => {
    for (const fonte of FONTES) {
      expect(fonte).not.toMatch(/text-\[\d+(\.\d+)?px\]|fontSize/);
      expect(fonte).not.toMatch(/var\(--(wb-|mute|dim|line|panel|inset|r\d)/);
      expect(fonte).not.toMatch(/className="btn|'btn /);
    }
  });

  it('todo botão da tela é da sala (data-sala) e tem foco de verdade', () => {
    for (const html of [telas[0], telas[2]]) {
      const proprios = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]).filter((b) => !b.includes('aria-haspopup'));
      expect(proprios.length).toBeGreaterThan(0);
      for (const b of proprios) {
        expect(b).toMatch(/focus-visible:outline-foco/);
      }
    }
  });

  it('sem backdrop-filter; o feixe só no primário (o do h1 é o ScreenHeader)', () => {
    for (const html of telas) {
      expect(html).not.toMatch(/backdrop/);
      expect(html).not.toContain('text-feixe');
      // O mapa só acende o corte ABERTO (`aria-[current=true]:bg-feixe`); aqui nenhum está.
      const comFeixe = [...html.matchAll(/<[a-z]+[^>]*[\s"]bg-feixe[\s"][^>]*>/g)].map((m) => m[0]);
      expect(comFeixe.filter((t) => !t.includes('data-variant="primario"'))).toEqual([]);
    }
  });
});
