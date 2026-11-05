import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { montarBarraDoEditor } from '../acoesDoEditor';
import { mensagemDaFalhaDoBruto } from '../editorEditState';

// D-1044: riscar depois do bruto não avisava, e "Ir para a Pós" levava o vídeo antigo.

function barra(p: { brutoDefasado?: boolean; brutoOcupado?: boolean; aprovado?: boolean }) {
  const acoes = { onAlternarVeredito: vi.fn(), onGerarBruto: vi.fn(), onIrParaPos: vi.fn() };
  return {
    acoes,
    barra: montarBarraDoEditor({ aprovado: true, brutoPronto: true, brutoOcupado: false, salvando: false, ...acoes, ...p }),
  };
}

const fonte = (caminho: string) => readFileSync(resolve(__dirname, caminho), 'utf8');

describe('D-1044 · o principal do editor com o bruto defasado', () => {
  it('oferece regerar, sem o Enter disparar trabalho pesado', () => {
    const { barra: b, acoes } = barra({ brutoDefasado: true });
    expect(b.primario).toMatchObject({ texto: 'Regerar bruto', semEnter: true });
    b.primario!.onClick!();
    expect(acoes.onGerarBruto).toHaveBeenCalledOnce();
    expect(acoes.onIrParaPos).not.toHaveBeenCalled();
  });

  it('com o bruto em dia, segue para a Pós', () => {
    expect(barra({ brutoDefasado: false }).barra.primario?.texto).toBe('Ir para a Pós');
  });

  it('gerando, diz que está gerando, mesmo defasado', () => {
    expect(barra({ brutoDefasado: true, brutoOcupado: true }).barra.primario?.texto).toBe('Gerando bruto…');
  });

  it('corte não aprovado fica com o Aprovar padrão, sem aviso de regerar', () => {
    expect(barra({ brutoDefasado: true, aprovado: false }).barra).toEqual({});
  });

  it('a página lê o aviso do status do bruto', () => {
    expect(fonte('../EditorPage.tsx')).toContain('brutoDefasado: Boolean(statusBruto.data?.bruto_defasado)');
  });

  it('as pendências estão na barra das três telas, que passam pela bancada', () => {
    expect(fonte('../BancadaChrome.tsx')).toContain('pendencias: <PendenciasDoCorte corte={corte} />');
  });
});

describe('D-1044 · a falha do bruto com a live fora do disco', () => {
  it('diz o que fazer, em vez de só que o arquivo não foi encontrado', () => {
    const texto = mensagemDaFalhaDoBruto('Arquivo de vídeo original não encontrado.');
    expect(texto).toContain('baixe de novo na Biblioteca');
    expect(texto).not.toContain('Arquivo de vídeo original');
  });

  it('as outras falhas seguem com o motivo do backend', () => {
    expect(mensagemDaFalhaDoBruto('Nenhum segmento válido.')).toBe('Geração de bruto falhou: Nenhum segmento válido.');
  });

  it('o editor e a Pós usam a mesma mensagem', () => {
    expect(fonte('../useEditorPage.tsx')).toContain('notifyToast(mensagemDaFalhaDoBruto(msg)');
    expect(fonte('../../post-production/ScenesPostProductionPage.tsx')).toContain('notifyToast(mensagemDaFalhaDoBruto(msg)');
  });
});
