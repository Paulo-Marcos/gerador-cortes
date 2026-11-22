import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { luzDaSala } from '../luzDaSala';
import { UpgradeShell } from '../UpgradeShell';

// D-1147 (E-069 H-20b): a Prateleira do Fire (/shorts/:id/workspace) também toca vídeo.
// A regra de D-1142 (decisão do Paulo, 20/11, "por precaução") manda toda tela com vídeo
// a ter aurora só nos halos e vidro sólido. A Prateleira estava de fora: a lista
// TELAS_COM_VIDEO só tinha 'fire' (a Curadoria, /shorts/:id).

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

describe('D-1147 · a Prateleira do Fire é uma tela com vídeo', () => {
  it('sem blur e só com os halos, mesmo com a capa da live aberta', () => {
    expect(luzDaSala({ ...base, tela: 'prateleira' })).toEqual({ aurora: 'halos', vidro: false });
  });

  it('a Prateleira segue as condições de sala que valem para todas as telas (Reduzir efeitos)', () => {
    expect(luzDaSala({ ...base, tela: 'prateleira', reduzirEfeitos: true })).toEqual({ aurora: 'nenhuma', vidro: false });
  });

  it('a casca de /shorts/:id/workspace sai com data-vidro="0" e aurora só nos halos', () => {
    const html = casca('/shorts/s1/workspace');
    expect(atributo(html, 'data-vidro')).toBe('0');
    expect(html).toContain('data-aurora="halos"');
  });

  it('a Curadoria (/shorts/:id) continua sem blur, como antes', () => {
    const html = casca('/shorts/s1');
    expect(atributo(html, 'data-vidro')).toBe('0');
    expect(html).toContain('data-aurora="halos"');
  });
});
