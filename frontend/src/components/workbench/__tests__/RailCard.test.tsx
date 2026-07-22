import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Projeto } from '@/types/models';
import { RailCard } from '../ProjectRail';
import { WorkbenchTabsProvider } from '../WorkbenchTabsProvider';

const projeto = {
  id: '263',
  youtube_url: 'https://youtu.be/abc12345678',
  titulo_live: 'LIVE Ato do Álvaro',
  canal_origem: '@canal',
  data_live: '20260701',
  duracao_segundos: 3600,
  status: 'analisado',
  progresso_download: 100,
  arquivos_limpos: false,
  pontuacao_ranking: 0,
  total_cortes: 0,
  total_aprovados: 0,
  total_publicados: 0,
  total_com_meta: 0,
  total_video_pronto: 0,
} as Projeto;

function markup(props: { open: boolean; fixado: boolean }) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <WorkbenchTabsProvider>
        <RailCard projeto={projeto} onFixar={vi.fn()} {...props} />
      </WorkbenchTabsProvider>
    </MemoryRouter>,
  );
}

describe('RailCard — botão de fixar (D-400)', () => {
  it('rail aberto e projeto solto: oferece fixar', () => {
    const html = markup({ open: true, fixado: false });
    expect(html).toContain('aria-label="Fixar LIVE Ato do Álvaro no rail"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('rail aberto e projeto fixado: oferece desafixar', () => {
    const html = markup({ open: true, fixado: true });
    expect(html).toContain('aria-label="Desafixar LIVE Ato do Álvaro"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('rail colapsado: sem botão, mas marca o projeto fixado', () => {
    const html = markup({ open: false, fixado: true });
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('aria-label="Projeto fixado"');
  });

  it('rail colapsado e projeto solto: nenhuma marca de fixado', () => {
    const html = markup({ open: false, fixado: false });
    expect(html).not.toContain('Projeto fixado');
  });
});
