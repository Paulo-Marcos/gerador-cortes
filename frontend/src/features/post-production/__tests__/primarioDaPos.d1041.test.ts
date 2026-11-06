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
      planoValidado: true,
      ...acoes,
      ...p,
    }),
  };
}

const SEM_RASTRO = { id: 'c1', is_pos_producao: 0, arquivo_clip_path: '', cenas_remotion: [] } as unknown as Parameters<typeof nuncaGerouBruto>[0];
const CENA = { tipo: 'tela_cheia', inicio: 0, fim: 5 };
const SEM_BRUTO = { brutoAusente: true, arquivosLimpos: false };

describe('D-1041 · quem nunca gerou bruto', () => {
  it('sem bruto e sem rastro nenhum de geração, nunca gerou', () => {
    expect(nuncaGerouBruto(SEM_RASTRO, undefined, SEM_BRUTO)).toBe(true);
  });

  it.each([
    ['tem render no próprio corte: o editor conta como bruto pronto', { is_pos_producao: 1 }],
    ['tem cenas: já gerou antes, e regerar na Pós as preserva', { cenas_remotion: [CENA] }],
    ['tem o ponteiro do arquivo: o editor também conta como pronto', { arquivo_clip_path: 'clip_raw.mkv' }],
  ])('%s: não é o caso, mesmo fora do export', (_nome, rastro) => {
    const corte = { ...SEM_RASTRO, ...rastro } as Parameters<typeof nuncaGerouBruto>[0];
    expect(nuncaGerouBruto(corte, undefined, SEM_BRUTO)).toBe(false);
  });

  it('o export dizendo que o vídeo está pronto também conta', () => {
    const status = { corte_id: 'c1', video_pronto: true } as Parameters<typeof nuncaGerouBruto>[1];
    expect(nuncaGerouBruto(SEM_RASTRO, status, SEM_BRUTO)).toBe(false);
  });

  it('com o bruto no disco, ou depois da limpeza, não é o caso', () => {
    expect(nuncaGerouBruto(SEM_RASTRO, undefined, { ...SEM_BRUTO, brutoAusente: false })).toBe(false);
    expect(nuncaGerouBruto(SEM_RASTRO, undefined, { ...SEM_BRUTO, arquivosLimpos: true })).toBe(false);
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
