import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import type { OverflowMenuItem } from '@/components/ui/overflow-menu';
import { CorteLinhaAp, focoSaiuDaLinha } from '../CorteLinhaAp';

// O "⋯" de verdade só mostra o painel depois de um clique, e aqui não há
// DOM: o substituto desenha o gatilho e guarda o que a linha entregou a ele.
let maisRecebido: { items: OverflowMenuItem[]; label?: string; grande?: boolean } | undefined;
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: (props: { items: OverflowMenuItem[]; label?: string; grande?: boolean }) => {
    maisRecebido = props;
    return <button type="button" aria-label={props.label} className="h-8 w-8" />;
  },
}));

// D-868 · a linha desenhada de verdade: selo, barra de 8 passos com o verbo,
// Editar e o principal com rótulo, o "⋯" — e nada do que existia some.

const props = {
  onEnviarYoutube: vi.fn(),
  onInformarUrl: vi.fn(),
  onLiberarPublicacao: vi.fn(),
};

function desenhar(corte: Partial<Corte>, status: Partial<StatusExportCorte> = {}) {
  const st = {
    ...statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Pedro II e a Igreja' }),
    ...status,
  };
  const ct = {
    id: 'c7',
    numero: 7,
    status: 'proposto',
    is_fire: false,
    inicio_seg: 0,
    fim_seg: 60,
    inicio_hms: '00:06:44',
    fim_hms: '00:19:59',
    ...corte,
  } as unknown as Corte;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <CorteLinhaAp
            projetoId="p1"
            corte={ct}
            status={st}
            podeSubir
            podeDescer
            reordenando={false}
            onMover={vi.fn()}
            onEnviarYoutube={props.onEnviarYoutube}
            onInformarUrl={props.onInformarUrl}
            onLiberarPublicacao={props.onLiberarPublicacao}
            enviando={false}
            selecionado={false}
            onAlternarSelecao={vi.fn()}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const linha = (html: string) => html.slice(html.indexOf('<article'), html.indexOf('</article>'));

describe('CorteLinhaAp (D-868)', () => {
  it('estado em palavras: a barra de 8 passos diz o próximo, e as 11 siglas somem', () => {
    const html = linha(desenhar({}));
    expect(html).toContain('0 de 8 · próximo: gerar bruto');
    expect(html.match(/data-estado="/g)).toHaveLength(8);
    for (const sigla of ['>BRU<', '>GRD<', '>OVL<', '>FIN<', '>THU<', '>MET<', '>CENAS<', '>RENDER<'])
      expect(html).not.toContain(sigla);
  });

  it('o detalhe de cada etapa segue no hover do passo', () => {
    expect(linha(desenhar({}))).toMatch(/title="Bruto — é aqui que parou/);
  });

  it('uma ação por linha: Editar e o principal com rótulo, o resto no ⋯', () => {
    const html = linha(desenhar({}));
    expect(html).toMatch(/>Editar<\/button>/);
    expect(html).toMatch(/>Aprovar<\/button>/);
    expect(html).toContain('aria-label="Mais ações do corte 7"');
    // Os ícones soltos de antes não estão mais na linha.
    for (const antigo of ['title="Pós-produção"', 'aria-label="Metadados do corte"', 'title="Abrir a pasta do corte"'])
      expect(html).not.toContain(antigo);
  });

  it('alvos de 32 px nas ações', () => {
    const html = linha(desenhar({}));
    expect(html).toMatch(/style="height:32px"[^>]*>(?:<svg[^>]*>.*?<\/svg>)?Editar/);
    // O ⋯ de 32 px: `grande`, conferido abaixo e no próprio menu.
  });

  it('o principal acompanha o estado (aprovado → Finalizar)', () => {
    expect(linha(desenhar({ status: 'aprovado' }))).toMatch(/>Finalizar<\/button>/);
  });

  it('nada some: seleção, ordem, abrir pelo título e pela miniatura, fire, selo e timecode', () => {
    const html = linha(desenhar({ is_fire: true }));
    expect(html).toContain('aria-label="Selecionar o corte #7"');
    expect(html).toContain('aria-label="Mover corte 7 para cima"');
    expect(html).toContain('aria-label="Mover corte 7 para baixo"');
    expect(html).toContain('Abrir o corte 7 no editor');
    expect(html).toContain('>Pedro II e a Igreja</button>');
    expect(html).toContain('title="Marcado como fire"');
    expect(html).toContain('>proposto<');
    expect(html).toContain('00:06:44 → 00:19:59');
  });
});

describe('CorteLinhaAp · o ⋯ e a barra (D-868)', () => {
  it('a linha entrega ao ⋯ os itens que eram ícones soltos, com o alvo de 32 px', () => {
    desenhar({});
    expect(maisRecebido!.items.map((i) => i.label)).toEqual([
      'Pós-produção',
      'Metadados do corte',
      'Abrir a pasta do corte',
      'Informar a URL publicada',
    ]);
    expect(maisRecebido!.grande).toBe(true);
  });

  it('os itens de publicação chamam o que a tela passou à linha', () => {
    desenhar({});
    maisRecebido!.items.at(-1)!.onClick!();
    expect(props.onInformarUrl).toHaveBeenCalledOnce();
    desenhar({}, { tiktok_publicado_em: '2026-10-01T10:00:00' });
    expect(maisRecebido!.items.at(-1)!.label).toBe('Liberar publicação');
    maisRecebido!.items.at(-1)!.onClick!();
    expect(props.onLiberarPublicacao).toHaveBeenCalledOnce();
  });

  it('cada passo da barra leva a cor do seu estado', () => {
    const html = linha(desenhar({}, { raw_pronto: true }));
    expect(html).toMatch(/data-estado="feito"[^>]*background:var\(--ok\)/);
    expect(html).toMatch(/data-estado="agora"[^>]*background:var\(--warn\)/);
    expect(html).toMatch(/data-estado="falta"[^>]*background:var\(--line2\)/);
  });

  it('o corte rejeitado pinta o passo de erro e diz isso', () => {
    const html = linha(desenhar({ status: 'rejeitado' }));
    expect(html).toMatch(/data-estado="rejeitado"[^>]*background:var\(--err\)/);
    expect(html).toContain('corte rejeitado');
  });

  it('o principal "Enviar ao YouTube" chama o envio que a tela passou', () => {
    const fonte = readFileSync(resolve(__dirname, '../CorteLinhaAp.tsx'), 'utf8');
    expect(fonte).toContain('enviarYoutube: onEnviarYoutube,');
  });
});

describe('a linha com o foco sobe de camada (D-868)', () => {
  // Medido: o vidro de cada linha é um contexto de empilhamento, e a linha de
  // baixo pintava por cima do ⋯ aberto da de cima.
  const linhaFalsa = (dentro: unknown[]) => ({ contains: (n: unknown) => dentro.includes(n) });

  it('o foco que passa de um botão da linha para outro não conta como saída', () => {
    const botao = {};
    expect(
      focoSaiuDaLinha({ currentTarget: linhaFalsa([botao]), relatedTarget: botao } as never),
    ).toBe(false);
    expect(
      focoSaiuDaLinha({ currentTarget: linhaFalsa([]), relatedTarget: {} } as never),
    ).toBe(true);
    expect(focoSaiuDaLinha({ currentTarget: linhaFalsa([]), relatedTarget: null } as never)).toBe(
      true,
    );
  });

  it('a linha liga o foco à camada', () => {
    const fonte = readFileSync(resolve(__dirname, '../CorteLinhaAp.tsx'), 'utf8');
    expect(fonte).toContain('onFocus={foco.onFocus}');
    expect(fonte).toContain('onBlur={foco.onBlur}');
    expect(fonte).toMatch(/position: 'relative',\s*zIndex: foco\.camada,/);
    expect(fonte).toContain("camada: emFoco ? 3 : undefined,");
  });
});
