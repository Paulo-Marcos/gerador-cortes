import type { Desvio } from '@/types/models';
import { hmsParaSeg, segParaMmSs } from '../timeUtils';

// D-1150 (E-069 H-17) · a agulha da linha do tempo e o trecho sob ela (DIRECAO §3.3, §7.3).
//
// A agulha é "onde estou": traço claro (`--cc-foco`) e um rótulo no feixe com o tempo
// no corte. É um dos lugares do feixe (§3.1), e este arquivo é o único da onda isento
// na catraca `feixeSoNoLugar`.
//
// Tudo aqui vive dentro do shadow DOM do wavesurfer, onde as classes do Tailwind não
// chegam: o estilo vai pelo `style` do elemento, só com variáveis `--cc-*` (elas
// atravessam o shadow DOM por herança).

/** O seletor que o painel usa para saber se o cursor já tem a agulha (mantido do ponto antigo). */
export const ATRIBUTO_DA_AGULHA = 'data-playhead-dot';

/** A cor do traço da agulha, lida do token ao vivo (claro ou escuro). */
export const TOKEN_DA_AGULHA = '--cc-foco';

const ESTILO_DO_ROTULO = [
  'position:absolute',
  'left:50%',
  'top:2px',
  'transform:translateX(-50%)',
  'padding:0 6px',
  'border-radius:999px',
  'background:linear-gradient(100deg, var(--cc-feixe-a), var(--cc-feixe-b) 52%, var(--cc-feixe-c))',
  'box-shadow:0 0 12px -2px var(--cc-feixe-brilho)',
  'color:var(--cc-sobre-feixe)',
  'font:600 11px/16px var(--font-mono)',
  'font-variant-numeric:tabular-nums',
  'white-space:nowrap',
  'pointer-events:none',
  'z-index:6',
].join(';');

/** O rótulo da agulha: uma pílula no feixe presa ao topo do cursor. */
export function criarRotuloDaAgulha(): HTMLElement {
  const rotulo = document.createElement('span');
  rotulo.setAttribute(ATRIBUTO_DA_AGULHA, '1');
  rotulo.setAttribute('aria-hidden', 'true');
  rotulo.style.cssText = ESTILO_DO_ROTULO;
  return rotulo;
}

/** O texto do rótulo: o tempo dentro do corte, em m:ss (nunca negativo). */
export function textoDaAgulha(tempoSeg: number, inicioSeg: number): string {
  return segParaMmSs(Math.max(0, tempoSeg - inicioSeg));
}

/** Escreve o tempo no rótulo só quando ele muda: o painel chama isto a cada quadro. */
export function atualizarRotuloDaAgulha(cursor: HTMLElement, texto: string) {
  const rotulo = cursor.querySelector<HTMLElement>(`[${ATRIBUTO_DA_AGULHA}]`);
  if (rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
}

/** O trecho que sai sob a agulha, pelo índice na lista; -1 quando ela está no que fica. */
export function trechoSobAgulha(desvios: readonly Desvio[], tempoSeg: number): number {
  return desvios.findIndex((d) => {
    const inicio = hmsParaSeg(d.inicio_hms);
    const fim = hmsParaSeg(d.fim_hms);
    return fim > inicio && tempoSeg >= inicio && tempoSeg < fim;
  });
}

/** O contorno do trecho sob a agulha (§7.3: `cc-aviso`). Por cima da borda de origem. */
export const CONTORNO_SOB_AGULHA = '2px solid var(--cc-aviso)';

type RegiaoComElemento = { id: string; element?: HTMLElement | null };

/** Acende o contorno no trecho sob a agulha e apaga no resto. */
export function marcarSobAgulha(regioes: readonly RegiaoComElemento[], indice: number) {
  for (const regiao of regioes) {
    if (!regiao.id.startsWith('desvio-') || !regiao.element) continue;
    const sob = regiao.id === `desvio-${indice}`;
    regiao.element.toggleAttribute('data-sob-agulha', sob);
    regiao.element.style.outline = sob ? CONTORNO_SOB_AGULHA : '';
    regiao.element.style.outlineOffset = sob ? '-2px' : '';
  }
}
