import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModoBlock } from '../components';

// D-423: o modo com que NOVOS CORTES nascem tinha ido morar dentro da linha
// Projeto da escada de posicionamento, dividindo a linha com o botao "Definir
// ▾". No painel estreito a segunda pilula (COMP.) saia pela direita e o
// container corta com `overflow-x-hidden` — nao havia como pôr o projeto em
// Compartilhada. Estes testes fixam o contrato que reabriu esse caminho.

const noop = vi.fn();

function render(props: Partial<Parameters<typeof ModoBlock>[0]> = {}) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ModoBlock
        modoCorte="full"
        onChangeModoCorte={noop}
        herdando
        tipoProjeto="full"
        onChangeTipoProjeto={noop}
        pendingProjeto={false}
        {...props}
      />
    </TooltipProvider>,
  );
}

/** Recorta o trecho de markup de uma das duas linhas de modo. */
function linha(html: string, rotulo: 'Este corte' | 'Novos cortes'): string {
  const inicio = html.indexOf(rotulo);
  expect(inicio).toBeGreaterThan(-1);
  const fim = rotulo === 'Este corte' ? html.indexOf('Novos cortes') : html.length;
  return html.slice(inicio, fim === -1 ? html.length : fim);
}

describe('ModoBlock', () => {
  it('mostra as duas decisoes de modo: a do corte e a de novos cortes', () => {
    const html = render();
    expect(html).toContain('Este corte');
    expect(html).toContain('Novos cortes');
    expect(html).toContain('padrão do projeto');
  });

  it('oferece as DUAS pilulas em cada linha — 4 botoes de modo no bloco', () => {
    const html = render();
    // O bug era exatamente este: so FULL alcancavel na linha do projeto.
    expect(html.match(/>FULL</g) ?? []).toHaveLength(2);
    expect(html.match(/>COMP\.</g) ?? []).toHaveLength(2);
  });

  it('as pilulas nao encolhem — quem cede espaco no painel estreito e o rotulo', () => {
    // Asserçao de classe deliberada: `flex-none` nas pilulas + `truncate` no
    // rotulo SAO a correcao. Sem isso o controle volta a sair da area visivel.
    const html = render();
    expect(html).toContain('inline-flex flex-none items-center');
    expect(html).toContain('truncate');
  });

  it('a linha "Novos cortes" reflete o tipo do projeto, nao o modo do corte', () => {
    const html = render({ modoCorte: 'full', herdando: false, tipoProjeto: 'compartilhada' });
    const projeto = linha(html, 'Novos cortes');
    expect(projeto).toMatch(/aria-pressed="true"[^>]*title="Compartilhada"/);
    expect(projeto).toMatch(/aria-pressed="false"[^>]*title="Full"/);
  });

  it('corte herdando: nenhuma pilula do corte fica pressed e o caption diz de onde vem', () => {
    const html = render({ herdando: true, tipoProjeto: 'compartilhada' });
    const corte = linha(html, 'Este corte');
    expect(corte).toContain('↳ herdando do Projeto: Compartilhada');
    expect(corte).not.toContain('aria-pressed="true"');
  });

  it('corte sobrescrevendo: caption nomeia o modo do projeto que esta sendo ignorado', () => {
    const html = render({ modoCorte: 'compartilhada', herdando: false, tipoProjeto: 'full' });
    expect(linha(html, 'Este corte')).toContain('sobrescrevendo o Projeto (Full)');
  });

  it('expoe o caminho de volta ao modo do projeto quando ha override', () => {
    expect(render({ herdando: false, onResetCorte: noop })).toContain(
      'aria-label="Voltar ao modo do projeto"',
    );
    expect(render({ herdando: true })).not.toContain('aria-label="Voltar ao modo do projeto"');
  });

  it('desabilita as pilulas do projeto enquanto a mutation esta em voo', () => {
    const projeto = linha(render({ pendingProjeto: true }), 'Novos cortes');
    expect(projeto.match(/disabled=""/g) ?? []).toHaveLength(2);
  });
});
