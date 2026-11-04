import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { primarioDaPos } from '../postProductionNavigation';

// D-1041: a Pós dizia "a limpeza apagou" num corte que nunca teve bruto, e o
// render ficava travado sem caminho à vista. Medido no navegador na D-1019.

function primario(p: Partial<Parameters<typeof primarioDaPos>[0]> = {}) {
  const acoes = { onRenderizar: vi.fn(), onIrAoEditor: vi.fn() };
  return {
    acoes,
    primario: primarioDaPos({
      rodando: false,
      progresso: 0,
      videoPronto: false,
      brutoAusente: false,
      arquivosLimpos: false,
      ...acoes,
      ...p,
    }),
  };
}

describe('D-1041 · a Pós sem bruto', () => {
  it('corte que nunca teve bruto leva ao editor, sem falar em limpeza', () => {
    const { primario: p, acoes } = primario({ brutoAusente: true });
    expect(p.texto).toBe('Gerar bruto no editor');
    expect('desabilitado' in p && p.desabilitado).toBeFalsy();
    expect('motivo' in p && p.motivo).toBeFalsy();
    p.onClick();
    expect(acoes.onIrAoEditor).toHaveBeenCalledOnce();
    expect(acoes.onRenderizar).not.toHaveBeenCalled();
  });

  it('corte cuja mídia a limpeza apagou continua dizendo isso, com o render travado', () => {
    const { primario: p } = primario({ brutoAusente: true, arquivosLimpos: true });
    expect(p).toMatchObject({ texto: 'Renderizar final', desabilitado: true });
    expect('motivo' in p && p.motivo).toContain('a limpeza apagou');
  });
});

describe('D-1041 · a Pós com bruto segue como estava', () => {
  it('oferece o render, sem o Enter disparar GPU', () => {
    const { primario: p, acoes } = primario();
    expect(p).toMatchObject({ texto: 'Renderizar final', desabilitado: false, semEnter: true });
    p.onClick();
    expect(acoes.onRenderizar).toHaveBeenCalledOnce();
  });

  it('com o vídeo pronto, oferece renderizar de novo', () => {
    expect(primario({ videoPronto: true }).primario.texto).toBe('Renderizar de novo');
  });

  it('rodando, mostra o progresso e trava', () => {
    expect(primario({ rodando: true, progresso: 40 }).primario).toMatchObject({
      texto: 'Renderizando 40%',
      desabilitado: true,
    });
  });
});

// A página depende de dezenas de consultas; a ligação se confere na fonte.
describe('D-1041 · a ligação na Pós', () => {
  const pagina = readFileSync(resolve(__dirname, '../ScenesPostProductionPage.tsx'), 'utf8');

  it('o principal e o "Gerar bruto" do Mais seguem a mesma regra', () => {
    expect(pagina).toContain('primario: primarioDaPos({');
    expect(pagina).toContain('onGerarBruto={brutoAusente && !arquivosLimpos ? irAoEditor : regerarBruto}');
    expect(pagina).toContain('Boolean(projeto.data?.arquivos_limpos)');
  });

  it('sem nenhuma fonte no disco, o player não pede arquivo que não existe', () => {
    expect(pagina).toMatch(/const videoSrc = fontes\.length === 0\s+\? ''/);
  });
});
