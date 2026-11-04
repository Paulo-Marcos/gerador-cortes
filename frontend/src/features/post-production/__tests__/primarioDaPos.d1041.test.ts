import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { montarPrimarioDaPos, nuncaGerouBruto } from '../postProductionNavigation';

// D-1041: a Pós dizia "a limpeza apagou" num corte que nunca teve bruto, e o
// render ficava travado sem caminho à vista. Medido no navegador na D-1019.

function primario(p: Partial<Parameters<typeof montarPrimarioDaPos>[0]> = {}) {
  const acoes = { onRenderizar: vi.fn(), onIrAoEditor: vi.fn() };
  return {
    acoes,
    primario: montarPrimarioDaPos({
      rodando: false,
      progresso: 0,
      videoPronto: false,
      brutoAusente: false,
      arquivosLimpos: false,
      nuncaGerou: false,
      gerandoBruto: false,
      ...acoes,
      ...p,
    }),
  };
}

const SEM_RASTRO = {
  brutoAusente: true,
  arquivosLimpos: false,
  videoPronto: false,
  cenasGeradas: false,
  temPonteiroDoBruto: false,
};

describe('D-1041 · quem nunca gerou bruto', () => {
  it('sem bruto e sem rastro nenhum de geração, nunca gerou', () => {
    expect(nuncaGerouBruto(SEM_RASTRO)).toBe(true);
  });

  it.each([
    ['tem o bruto', { brutoAusente: false }],
    ['a limpeza apagou', { arquivosLimpos: true }],
    ['tem render: o editor conta como bruto pronto e devolveria à Pós', { videoPronto: true }],
    ['tem cenas: já gerou antes, e regerar na Pós as preserva', { cenasGeradas: true }],
    ['tem o ponteiro do arquivo: o editor também conta como pronto', { temPonteiroDoBruto: true }],
  ])('%s: não é o caso', (_nome, rastro) => {
    expect(nuncaGerouBruto({ ...SEM_RASTRO, ...rastro })).toBe(false);
  });
});

describe('D-1041 · a Pós sem bruto', () => {
  it('corte que nunca gerou leva ao editor, sem falar em limpeza', () => {
    const { primario: p, acoes } = primario({ brutoAusente: true, nuncaGerou: true });
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

  it('corte com render que perdeu o bruto trava o render, sem culpar a limpeza nem mandar ao editor', () => {
    const { primario: p } = primario({ brutoAusente: true, videoPronto: true });
    expect(p).toMatchObject({ texto: 'Renderizar de novo', desabilitado: true });
    expect('motivo' in p && p.motivo).toContain('regere o bruto');
    expect('motivo' in p && p.motivo).not.toContain('limpeza');
  });

  it('com o bruto sendo gerado, diz isso e não oferece outra ação', () => {
    const { primario: p } = primario({ brutoAusente: true, nuncaGerou: true, gerandoBruto: true });
    expect(p).toMatchObject({ texto: 'Gerando bruto…', desabilitado: true });
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

  it('regerar o bruto enquanto há bruto não troca o principal do render', () => {
    expect(primario({ gerandoBruto: true }).primario.texto).toBe('Renderizar final');
  });
});

// A página depende de dezenas de consultas; a ligação se confere na fonte.
describe('D-1041 · a ligação na Pós', () => {
  const pagina = readFileSync(resolve(__dirname, '../ScenesPostProductionPage.tsx'), 'utf8');

  it('o principal usa a regra, e o destino do corte que nunca gerou é o editor dele', () => {
    expect(pagina).toContain('primario: montarPrimarioDaPos({');
    expect(pagina).toContain('onIrAoEditor: () => navigate(rawEditorPath(projetoId, corte.id))');
    expect(pagina).toContain('Boolean(projeto.data?.arquivos_limpos)');
  });

  it('o "Gerar bruto" do Mais some para quem nunca gerou, e regerar segue para os demais', () => {
    expect(pagina).toContain('onGerarBruto={nuncaGerou ? undefined : regerarBruto}');
  });

  it('sem nenhuma fonte no disco, o player não pede arquivo que não existe', () => {
    expect(pagina).toMatch(/const videoSrc = fontes\.length === 0\s+\? ''/);
  });
});
