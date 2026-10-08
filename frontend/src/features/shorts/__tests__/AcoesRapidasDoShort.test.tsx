import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pedidoKey } from '@/features/capa-chatgpt/useCapaNoChatGPT';
import { AcoesRapidasDoShort, GerarCapaComIA, ganchoParaGravar } from '../AcoesRapidasDoShort';
import { CapaModal } from '../CapaModal';
import type { ShortSugerido } from '../shortsApi';
import { promptDaCapaKey } from '../useShortsDoCorte';

// D-900: o que não pede escolha (capa com IA, gancho) a um clique, na lista —
// e o que pede escolha continua no modal.

const short = (campos: Partial<ShortSugerido>) =>
  ({ id: 's1', corte_id: 'c1', status: 'aprovado', gancho_tela: '', ...campos }) as ShortSugerido;

function renderizar(conteudo: ReactNode, preparar?: (qc: QueryClient) => void) {
  const qc = new QueryClient();
  qc.setQueryData(['capa-chatgpt', 'configuracao'], {
    projeto_url: 'https://chatgpt.com/g/g-p-x/project',
    fichas: [],
    maximo_de_fichas: 10,
  });
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{conteudo}</QueryClientProvider>);
}

const acoes = (s: ShortSugerido, faltaCapa = false) =>
  renderizar(
    <AcoesRapidasDoShort short={s} corteId="c1" faltaCapa={faltaCapa} onAbrirCapa={() => undefined} />,
  );

describe('ações rápidas do trecho', () => {
  it('trecho aprovado sem gancho oferece capa e gancho', () => {
    const html = acoes(short({}));
    expect(html).toContain('Gerar capa com IA');
    expect(html).toContain('Gerar gancho');
  });

  it('trecho com gancho escrito não oferece gerar outro por cima', () => {
    const html = acoes(short({ gancho_tela: 'o juro trabalha contra você' }));
    expect(html).toContain('Gerar capa com IA');
    expect(html).not.toContain('Gerar gancho');
  });

  it('sugerido ou rejeitado não ganha ações', () => {
    expect(acoes(short({ status: 'sugerido' }))).toBe('');
    expect(acoes(short({ status: 'rejeitado' }))).toBe('');
  });

  it('o lembrete da capa que falta continua levando ao modal', () => {
    expect(acoes(short({}), true)).toContain('Falta escolher a capa');
    expect(acoes(short({}), false)).not.toContain('Falta escolher a capa');
  });
});

describe('gerar capa com IA', () => {
  it('mostra o passo do robô e trava enquanto a arte está sendo feita', () => {
    const html = renderizar(<GerarCapaComIA shortId="s1" />, (qc) => {
      qc.setQueryData(promptDaCapaKey('s1'), { prompt: 'o sapo de terno' });
      qc.setQueryData(pedidoKey('short', 's1', 'o sapo de terno'), {
        id: 'p1',
        destino: 'short',
        alvo_id: 's1',
        corte_id: 'c1',
        estado: 'rodando',
        etapa: 'Esperando o ChatGPT desenhar',
        erro: '',
      });
    });
    expect(html).toContain('Esperando o ChatGPT desenhar');
    expect(html).toContain('disabled');
  });
});

describe('o gancho que a IA grava', () => {
  it('a primeira variação aproveitável, em trecho sem gancho', () => {
    expect(ganchoParaGravar('', ['  ', ' o juro corre contra você '])).toBe('o juro corre contra você');
  });

  it('nunca por cima de um gancho escrito', () => {
    expect(ganchoParaGravar('o meu gancho', ['outro'])).toBeNull();
  });

  it('nada aproveitável, nada gravado', () => {
    expect(ganchoParaGravar(undefined, [])).toBeNull();
  });
});

// pr-audit do #157: abrir na arte é o pedido ("deixa a geração da imagem sendo
// a tela principal, e não a que diz que vai pegar um frame"), e sem este teste
// voltar a abrir no quadro não derrubava nada.
describe('modal da capa do short', () => {
  it('abre na aba da arte, e ela vem primeiro', () => {
    const html = renderizar(
      <CapaModal open onClose={() => undefined} short={{ id: 's1', titulo: 'T' }} />,
    );
    const abas = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map(
      ([, pressionada, rotulo]) => [rotulo, pressionada],
    );
    expect(abas.slice(0, 2)).toEqual([
      ['Arte desenhada', 'true'],
      ['Quadro do vídeo', 'false'],
    ]);
  });
});
