import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModoBlock } from '../components';
import type { OrigemDoTipo } from '../../youtubeLayoutPadrao';

// D-971: o corte que sobrescreve dizia "sobrescrevendo o Projeto (X)" mesmo
// quando o X vinha do Global ou do padrão do app — o projeto não tinha modo.
// A legenda cita a origem real, como a de herança da D-970 (RN-10).

const noop = vi.fn();

function legendaDoCorte(origemTipoProjeto: OrigemDoTipo): string {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <ModoBlock
        modoCorte="compartilhada"
        onChangeModoCorte={noop}
        herdando={false}
        tipoProjeto="full"
        origemTipoProjeto={origemTipoProjeto}
        onChangeTipoProjeto={noop}
        pendingProjeto={false}
      />
    </TooltipProvider>,
  );
  return html.slice(html.indexOf('Este corte'), html.indexOf('Novos cortes'));
}

describe('ModoBlock — de onde vem o modo sobrescrito (D-971)', () => {
  it('modo gravado no projeto: sobrescrevendo o Projeto', () => {
    expect(legendaDoCorte('projeto')).toContain('sobrescrevendo o Projeto (Full)');
  });

  it('projeto sem modo, Global com modo: sobrescrevendo o Global', () => {
    const legenda = legendaDoCorte('global');
    expect(legenda).toContain('sobrescrevendo o Global (Full)');
    expect(legenda).not.toContain('Projeto');
  });

  it('nenhum escopo grava modo: sobrescrevendo o padrão do app', () => {
    expect(legendaDoCorte('padrao')).toContain('sobrescrevendo o padrão do app (Full)');
  });

  it('a origem é obrigatória: sem ela não existe legenda certa', () => {
    const semOrigem = (
      // @ts-expect-error D-971: origemTipoProjeto deixou de ter o default 'projeto'
      <ModoBlock
        modoCorte="full"
        onChangeModoCorte={noop}
        herdando
        tipoProjeto="full"
        onChangeTipoProjeto={noop}
        pendingProjeto={false}
      />
    );
    expect(semOrigem).toBeTruthy();
  });
});

describe('o preset do modal de posição usa a conversão única (D-971)', () => {
  it('o payload Full sai de fullFromSynthetic, não de uma cópia à mão', () => {
    const fonte = readFileSync('src/features/editor/fase2/PosicionamentoModal.tsx', 'utf-8');
    expect(fonte).toContain('full: fullFromSynthetic(config)');
    expect(fonte).not.toContain('crop: { ...config.crop_tela }');
  });
});
