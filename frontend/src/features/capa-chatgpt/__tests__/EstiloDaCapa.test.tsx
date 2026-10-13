import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { ClaridadeDaCapa, EstiloDaCapa } from '../api';
import { AvisoDeClaridade, avisoDeClaridade } from '../AvisoDeClaridade';
import { EstiloDaCapaSection } from '../EstiloDaCapaSection';

// D-909: a tela de Canais escolhe o protagonista das capas, guarda as fotos do
// apresentador e a meta de claridade; o card da capa avisa quando ela sai escura.

const ESTILO: EstiloDaCapa = {
  protagonista: 'apresentador',
  luminancia_minima: 95,
  escuros_maximo: 40,
  fotos_do_apresentador: ['indignado-2.png', 'pensativo.jpg'],
  expressoes: ['indignado', 'pensativo'],
  maximo_de_fotos: 40,
};

function renderizarSecao(estilo: EstiloDaCapa) {
  const qc = new QueryClient();
  qc.setQueryData(['capa-chatgpt', 'estilo'], estilo);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EstiloDaCapaSection />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('EstiloDaCapaSection', () => {
  it('marca o protagonista escolhido, um só', () => {
    const html = renderizarSecao(ESTILO);

    expect(html).toContain('role="radiogroup"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Apresentador/);
    expect(html).toMatch(/aria-checked="false"[^>]*>.*?Mascote/);
  });

  it('lista as fotos pelo nome e as expressões que os nomes declaram', () => {
    const html = renderizarSecao(ESTILO);

    expect(html).toContain('Fotos do apresentador (2)');
    expect(html).toContain('/api/capa-chatgpt/apresentador/indignado-2.png?v=0');
    expect(html).toContain('Expressões: indignado, pensativo');
    expect(html).toContain('aria-label="Remover pensativo.jpg"');
  });

  it('mostra a meta de claridade gravada', () => {
    const html = renderizarSecao({ ...ESTILO, luminancia_minima: 100, escuros_maximo: 35 });

    expect(html).toContain('value="100"');
    expect(html).toContain('value="35"');
  });

  it('banco cheio trava o botão de adicionar', () => {
    const html = renderizarSecao({ ...ESTILO, maximo_de_fotos: 2 });

    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*?Adicionar fotos/);
  });
});

const ESCURA: ClaridadeDaCapa = {
  luminancia: 72.5,
  escuros_pct: 75,
  luminancia_minima: 95,
  escuros_maximo: 40,
  abaixo_da_meta: true,
};

describe('avisoDeClaridade', () => {
  it('diz as duas réguas que a capa furou', () => {
    expect(avisoDeClaridade(ESCURA)).toBe(
      'Capa escura: luz 73 (meta ≥ 95) · 75% escuro (meta ≤ 40%)',
    );
  });

  it('diz só a régua que furou', () => {
    expect(avisoDeClaridade({ ...ESCURA, luminancia: 120 })).toBe(
      'Capa escura: 75% escuro (meta ≤ 40%)',
    );
  });

  it('capa dentro da meta, ou sem medida, não avisa', () => {
    expect(avisoDeClaridade({ ...ESCURA, abaixo_da_meta: false })).toBeNull();
    expect(avisoDeClaridade(null)).toBeNull();
    expect(avisoDeClaridade(undefined)).toBeNull();
  });
});

describe('AvisoDeClaridade', () => {
  const renderizar = (claridade: ClaridadeDaCapa | null) => {
    const qc = new QueryClient();
    qc.setQueryData(['capa-chatgpt', 'claridade', 'c1', 'http://x/capa.png?v=1'], claridade);
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <AvisoDeClaridade corteId="c1" capaUrl="http://x/capa.png?v=1" />
      </QueryClientProvider>,
    );
  };

  it('aparece embaixo da capa escura', () => {
    expect(renderizar(ESCURA)).toContain('Capa escura');
  });

  it('some quando a capa está clara', () => {
    expect(renderizar({ ...ESCURA, abaixo_da_meta: false })).toBe('');
  });
});
