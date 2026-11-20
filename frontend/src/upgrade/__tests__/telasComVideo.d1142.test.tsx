import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { luzDaSala } from '../luzDaSala';
import { UpgradeShell } from '../UpgradeShell';

// D-1142 (E-069 H-13; DIRECAO §3.6): a Revisão e o workspace do Fire também tocam
// vídeo. Por precaução (decisão do Paulo, 20/11), entram na regra do Editor e da Pós:
// vidro sólido e aurora só com os halos, sem a capa.

const CANAL = { id: 'sapo', nome: 'Sapo Analítico', handle: '@sapo', ativo: true, credito: '', youtube_channel_id: '', paleta: { primaria: '', secundaria: '', acento: '' } };
const base = { temCapa: true, reduzirEfeitos: false, transparenciaReduzida: false, foco: false };

function casca(rota: string) {
  const qc = new QueryClient();
  qc.setQueryData(['canais'], { canais: [CANAL] });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <UpgradeShell>
          <p>conteudo-da-tela</p>
        </UpgradeShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const atributo = (html: string, nome: string) => new RegExp(`<div class="ap [^"]*"[^>]*${nome}="([^"]*)"`).exec(html)?.[1];

describe('luzDaSala · as quatro telas com vídeo', () => {
  it.each(['cortes', 'pos', 'revisao', 'fire'] as const)('%s: só os halos e nenhum blur, mesmo com capa', (tela) => {
    expect(luzDaSala({ ...base, tela })).toEqual({ aurora: 'halos', vidro: false });
  });

  it.each(['biblioteca', 'projeto', 'metadados', 'shorts', 'prontos'] as const)('%s: nada muda (aurora da capa e vidro)', (tela) => {
    expect(luzDaSala({ ...base, tela })).toEqual({ aurora: 'capa', vidro: true });
  });
});

describe('a casca · Revisão e Fire', () => {
  it.each([
    ['a Revisão', '/projetos/p1/final-review'],
    ['o Fire', '/shorts/s1'],
  ])('%s: data-vidro="0" e a aurora só com os halos', (_, rota) => {
    const html = casca(rota);
    expect(atributo(html, 'data-vidro')).toBe('0');
    expect(html).toContain('data-aurora="halos"');
  });

  it('fora do vídeo o vidro segue desfocando', () => {
    expect(atributo(casca('/projetos/p1/metadados'), 'data-vidro')).toBe('1');
  });
});
