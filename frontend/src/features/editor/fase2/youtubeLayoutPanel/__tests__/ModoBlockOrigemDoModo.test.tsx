import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModoBlock } from '../components';

// D-970: o corte que herda dizia "herdando do Projeto" mesmo quando o projeto
// também herdava do Global. A legenda cita a origem real do modo (RN-10).

const noop = vi.fn();

function legendaDoCorte(props: Partial<Parameters<typeof ModoBlock>[0]>): string {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <ModoBlock
        modoCorte="full"
        onChangeModoCorte={noop}
        herdando
        tipoProjeto="compartilhada"
        origemTipoProjeto="projeto"
        onChangeTipoProjeto={noop}
        pendingProjeto={false}
        {...props}
      />
    </TooltipProvider>,
  );
  return html.slice(html.indexOf('Este corte'), html.indexOf('Novos cortes'));
}

describe('ModoBlock — de onde vem o modo herdado', () => {
  it('modo gravado no projeto: herdando do Projeto', () => {
    expect(legendaDoCorte({ origemTipoProjeto: 'projeto' })).toContain(
      '↳ herdando do Projeto: Compartilhada',
    );
  });

  it('projeto sem modo, Global com modo: herdando do Global', () => {
    const legenda = legendaDoCorte({ origemTipoProjeto: 'global' });
    expect(legenda).toContain('↳ herdando do Global: Compartilhada');
    expect(legenda).not.toContain('do Projeto');
  });

  it('nenhum escopo grava modo: herdando do padrão do app', () => {
    expect(legendaDoCorte({ origemTipoProjeto: 'padrao', tipoProjeto: 'full' })).toContain(
      '↳ herdando do padrão do app: Full',
    );
  });
});
