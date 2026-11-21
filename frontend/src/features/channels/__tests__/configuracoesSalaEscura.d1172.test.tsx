import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Canal } from '../api/canais';
import { ChannelCard } from '../ChannelCard';
import { ChannelsPage } from '../ChannelsPage';
import { ChannelThemeSection } from '../ChannelThemeSection';
import { EscolhaDoEstilo } from '../PalcoComponentesSection';

// D-1172 (E-069 H-21; DIRECAO §5 e §7.7) · As Configurações na Sala escura.

const canal = {
  id: 'meu-canal',
  handle: '@meucanal',
  nome: 'Meu canal',
  credito: '',
  youtube_channel_id: '',
  paleta: { primaria: '', secundaria: '', acento: '' },
  luz: ['#ff8800', '#0088ff'],
  ativo: true,
} as unknown as Canal;

const outro = { ...canal, id: 'outro', nome: 'Outro canal', ativo: false } as Canal;

function montar(no: React.ReactNode, entrada = '/canais') {
  const qc = new QueryClient();
  qc.setQueryData(['canais'], { canais: [canal, outro], ativo: 'meu-canal' });
  qc.setQueryData(['temas'], {
    temas: [
      { id: 'a', nome: 'Tema A', fonte_preset: 'x', paleta: {} },
      { id: 'b', nome: 'Tema B', fonte_preset: 'y', paleta: {} },
    ],
  });
  qc.setQueryData(['tema-canal', 'meu-canal'], { tema_id: 'b' });
  qc.setQueryData(['operador'], { nome: 'Paulo' });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entrada]}>{no}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('a tela de Configurações não tem primária (§5)', () => {
  it('Canal ativo: zero botões primários', () => {
    esperarPrimarios(montar(<ChannelsPage />), 'Configuracoes');
  });

  it('Aplicação: zero botões primários', () => {
    esperarPrimarios(montar(<ChannelsPage />, '/canais?aba=aplicacao'), 'Configuracoes');
  });
});

describe('o cartão de identidade (§7.7)', () => {
  const html = montar(<ChannelsPage />);

  it('o canal ativo leva o fio de luz, o selo e o avatar no anel da luz', () => {
    expect(html.match(/data-fio-de-luz/g)).toHaveLength(1);
    expect(html).toContain('Canal ativo');
    expect(html).toContain('data-luz="canal"');
  });

  it('sem paleta cadastrada, a luz amostrada das capas é dita e a paleta é convidada', () => {
    expect(html).toContain('amostrada das capas');
    expect(html).toContain('Cadastrar paleta');
  });

  it('um canal que não é o ativo não leva o fio', () => {
    const lista = renderToStaticMarkup(
      <ChannelCard canal={outro} selecionando={false} onSelecionar={() => {}} onEditar={() => {}} />,
    );
    expect(lista).not.toContain('data-fio-de-luz');
  });
});

describe('o tema do render é escolha em cartões de opção (§7.7)', () => {
  const html = montar(<ChannelThemeSection />);

  it('rádios de um grupo, e o escolhido é o marcado', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>(?:(?!<\/button>).)*Tema B/);
    expect(html).toMatch(/role="radio"[^>]*aria-checked="false"[^>]*>(?:(?!<\/button>).)*Tema A/);
  });
});

describe('o estilo do palco é escolha em cartões de opção (§7.7)', () => {
  // Sozinho de propósito: na tela de Canais há outros rádios marcados (a capa do TikTok), e
  // um teste que só procura `aria-checked="true"` passaria com o estilo desmarcado.
  const html = renderToStaticMarkup(<EscolhaDoEstilo estilo="limpo" onEscolher={() => {}} />);

  it('o estilo atual do canal é o cartão marcado, e só ele', () => {
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>(?:(?!<\/button>).)*Limpo/);
    expect(html).toMatch(/role="radio"[^>]*aria-checked="false"[^>]*>(?:(?!<\/button>).)*Atual/);
  });
});

describe('a aba Aplicação', () => {
  const html = montar(<ChannelsPage />, '/canais?aba=aplicacao');

  it('traz o nome do operador, o tema e "Reduzir efeitos"', () => {
    expect(html).toContain('Como o app chama você');
    expect(html).toMatch(/<input[^>]*value="Paulo"/);
    expect(html).toContain('Reduzir efeitos');
    expect(html).toContain('Claro');
  });

  it('o nome ainda não mudou: "Salvar nome" nasce desabilitado', () => {
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(<[^>]*>)*Salvar nome/);
  });
});

describe('o nome do operador grava pela rota que existe (D-1129)', () => {
  let pedidos: Request[] = [];
  beforeEach(() => {
    pedidos = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        pedidos.push(pedido);
        return new Response('{"nome":"Ana"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('PUT /api/operador com o nome', async () => {
    const { operadorApi } = await import('@/features/settings/NomeDoOperador');
    expect(await operadorApi.definir('Ana')).toEqual({ nome: 'Ana' });
    expect(pedidos.map((p) => [p.method, new URL(p.url).pathname])).toEqual([['PUT', '/api/operador']]);
    expect(await pedidos[0].json()).toEqual({ nome: 'Ana' });
  });
});
