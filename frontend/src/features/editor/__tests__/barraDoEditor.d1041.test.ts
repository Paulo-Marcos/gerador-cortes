import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { acaoDaTecla, type Contexto } from '@/upgrade/teclasDaCasca';
import { montarBarraDoEditor } from '../acoesDoEditor';

// D-1041: no editor, o corte aprovado tinha "Aprovado" como botão principal, e o
// clique ou o Enter o devolviam a proposto. Medido no navegador na D-1019.

function barra(p: { aprovado?: boolean; brutoPronto?: boolean; brutoOcupado?: boolean } = {}) {
  const acoes = { onAlternarVeredito: vi.fn(), onGerarBruto: vi.fn(), onIrParaPos: vi.fn() };
  return {
    acoes,
    barra: montarBarraDoEditor({
      aprovado: true,
      brutoPronto: false,
      brutoOcupado: false,
      salvando: false,
      ...acoes,
      ...p,
    }),
  };
}

describe('D-1041 · o principal do editor', () => {
  it('corte não aprovado fica com o Aprovar padrão da bancada', () => {
    expect(barra({ aprovado: false }).barra).toEqual({});
  });

  it('aprovado sem bruto: gerar o bruto, sem o Enter disparar trabalho pesado', () => {
    const { barra: b, acoes } = barra();
    expect(b.primario).toMatchObject({ texto: 'Gerar bruto', semEnter: true });
    b.primario!.onClick!();
    expect(acoes.onGerarBruto).toHaveBeenCalledOnce();
  });

  it('aprovado com bruto: seguir para a Pós', () => {
    const { barra: b, acoes } = barra({ brutoPronto: true });
    expect(b.primario?.texto).toBe('Ir para a Pós');
    expect(b.primario?.semEnter).toBeFalsy();
    b.primario!.onClick!();
    expect(acoes.onIrParaPos).toHaveBeenCalledOnce();
  });

  it('com o bruto em geração, o principal diz isso e não dispara de novo', () => {
    expect(barra({ brutoOcupado: true }).barra.primario).toMatchObject({
      texto: 'Gerando bruto…',
      desabilitado: true,
    });
    expect(barra({ brutoOcupado: true, brutoPronto: true }).barra.primario?.desabilitado).toBe(true);
  });

  it.each([
    [{ brutoPronto: false }],
    [{ brutoPronto: true }],
    [{ brutoOcupado: true }],
  ])('o principal nunca devolve o corte aprovado (%j)', (estado) => {
    const { barra: b, acoes } = barra(estado);
    b.primario!.onClick!();
    expect(acoes.onAlternarVeredito).not.toHaveBeenCalled();
  });

  it('devolver mora no veredito à parte', () => {
    const { barra: b, acoes } = barra({ brutoPronto: true });
    expect(b.veredito?.aprovado).toBe(true);
    b.veredito!.onAlternar();
    expect(acoes.onAlternarVeredito).toHaveBeenCalledOnce();
  });

  it('Enter com o bruto para gerar não aciona o principal', () => {
    const contexto: Contexto = {
      tecla: 'Enter',
      meta: false,
      ctrl: false,
      alt: false,
      digitando: false,
      focoEmDecisao: false,
      overlayAberto: false,
      jaTratado: false,
      primarioDisponivel: !barra().barra.primario?.semEnter,
    };
    expect(acaoDaTecla(contexto)).toBeNull();
    // O controle: com o bruto pronto, o mesmo Enter segue para a Pós.
    const comBruto = !barra({ brutoPronto: true }).barra.primario?.semEnter;
    expect(acaoDaTecla({ ...contexto, primarioDisponivel: comBruto })).toBe('primario');
  });
});

// O hook do editor e a página dependem de roteador e de uma dúzia de consultas; a
// ligação se confere na fonte, como nos outros testes de acordo do editor.
describe('D-1041 · a ligação no editor', () => {
  const fonte = (caminho: string) => readFileSync(resolve(__dirname, caminho), 'utf8');

  it('a página passa a barra, com o veredito ligado ao mesmo alternar do A', () => {
    const pagina = fonte('../EditorPage.tsx');
    expect(pagina).toContain('barra={montarBarraDoEditor({ aprovado: estaAprovado(corteUI.status)');
    expect(pagina).toContain('onAlternarVeredito: toggleAprovado');
    expect(pagina).toContain('onIrParaPos: irParaPos');
  });

  it('A continua alternando o veredito', () => {
    expect(fonte('../useEditorPage.tsx')).toContain("'bruto.aprovar': toggleAprovado");
  });
});
