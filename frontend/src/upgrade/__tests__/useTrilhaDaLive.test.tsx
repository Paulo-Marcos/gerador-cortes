import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { exportStatusKey, projetoKey } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { cortesProjetoKey } from '@/shared/chavesDeCache';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import type { TelaId } from '../upgradeRoutes';
import { useTrilhaDaLive } from '../useTrilhaDaLive';

// D-866 · a fiação da trilha: o hook lê as três queries da live (do cache,
// pelas mesmas chaves das telas), o corte aberto da URL e o filtro "No ar".
// A regra em si é testada em trilhaDaLive.test; aqui, que os fios chegam.

function cacheDaLive(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(projetoKey(id), { id, status: 'analisado', arquivos_limpos: false });
  qc.setQueryData(cortesProjetoKey(id), [
    { id: 'a', status: 'aprovado' },
    { id: 'b', status: 'aprovado' },
    { id: 'c', status: 'proposto' },
  ]);
  qc.setQueryData(exportStatusKey(id), {
    cortes: [{ corte_id: 'a', video_pronto: true, metadados_completos: false, pronto_publicar: false, youtube_url_publicado: '' }],
  });
  return qc;
}

function Sonda({ tela, projetoId }: { tela: TelaId; projetoId: string }) {
  return <TrilhaDeEtapas etapas={useTrilhaDaLive(tela, projetoId)} />;
}

function desenhar(rota: string, tela: TelaId, projetoId = '267', qc = cacheDaLive('267')) {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Sonda tela={tela} projetoId={projetoId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Atributo a atributo: o Link escreve aria-label antes do href.
  const casas = Object.fromEntries(
    [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => {
      const [nome, rotulo] = /aria-label="([^"]*)"/.exec(tag)![1].split(': ');
      return [nome, { href: /href="([^"]*)"/.exec(tag)![1].replace(/&amp;/g, '&'), rotulo }];
    }),
  );
  return { html, casas, qc };
}

describe('useTrilhaDaLive', () => {
  it('conta pelos dados da live no cache (projeto, cortes e export)', () => {
    const { casas } = desenhar('/projetos/267/cortes/a', 'cortes');
    expect(casas['Cortes'].rotulo).toBe('2 de 3');
    expect(casas['Pós'].rotulo).toBe('1 de 2');
    expect(casas['Analisado'].rotulo).toBe('3 propostos, concluída');
  });

  it('cada etapa de tela leva ao corte aberto na URL (D-798)', () => {
    const { casas } = desenhar('/projetos/267/cortes/a', 'cortes');
    expect(casas['Cortes'].href).toBe('/projetos/267/cortes/a');
    expect(casas['Pós'].href).toBe('/projetos/267/post-production?corte=a');
    expect(casas['Revisão'].href).toBe('/projetos/267/final-review?corte=a');
  });

  it('no Workspace com ?filtro=no-ar, Publicado é a etapa acesa', () => {
    const { html } = desenhar('/projetos/267?filtro=no-ar', 'projeto');
    expect(html).toMatch(/aria-current="step"[^>]*aria-label="Publicado:/);
  });

  it('fora de uma live não desenha nem liga as queries do projeto', () => {
    const qc = new QueryClient();
    const { html } = desenhar('/shorts', 'shorts', '999', qc);
    expect(html).toBe('');
    const chaves = qc.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(chaves.some((k) => k.includes('999'))).toBe(false);
  });
});
