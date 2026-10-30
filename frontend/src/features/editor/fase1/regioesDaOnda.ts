import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { AlertaConferir, Desvio } from '@/types/models';
import { corDoSegmento } from './trechoBadge';
import { hmsParaSeg } from '../timeUtils';

// As regiões pintadas na onda da timeline: o corte, os trechos a remover e os
// alertas para conferir (D-998). Saiu do TimelinePanel, que está no teto da
// catraca de tamanho (D-771).

export type RegionsInstance = ReturnType<typeof RegionsPlugin.create>;

function elementoDa(region: unknown): HTMLElement | undefined {
  return (region as { element?: HTMLElement }).element;
}

export function drawRegions(
  regions: RegionsInstance,
  inicioSeg: number,
  fimSeg: number,
  desvios: Desvio[],
  offset: number,
  locked: boolean,
  alertas: AlertaConferir[],
  corDoCorte: string,
) {
  regions.clearRegions();
  const canMove = !locked;
  const mainRegion = regions.addRegion({
    id: 'corte-principal',
    start: Math.max(0, inicioSeg - offset),
    end: Math.max(0.1, fimSeg - offset),
    color: corDoCorte,
    drag: false,
    resize: false,
  });
  const regionEl = elementoDa(mainRegion);
  if (regionEl) {
    regionEl.style.overflow = 'visible';
    regionEl.style.pointerEvents = 'none';
  }
  desvios.forEach((d, idx) => {
    try {
      const start = hmsParaSeg(d.inicio_hms) - offset;
      const end = hmsParaSeg(d.fim_hms) - offset;
      if (end <= start) return;
      // D-515: a cor vem da CATEGORIA, e da mesma fonte que pinta o badge do
      // card. Antes era um vermelho unico cravado aqui: vinte trechos, vinte
      // barras iguais, e a unica forma de saber qual era qual era clicar.
      const region = regions.addRegion({
        id: `desvio-${idx}`,
        start: Math.max(0, start),
        end: Math.max(0.1, end),
        color: corDoSegmento(d),
        drag: canMove,
        resize: canMove,
      });
      if (!canMove) {
        const el = elementoDa(region);
        if (el) el.style.pointerEvents = 'none';
      }
    } catch {
      // skip malformed desvio
    }
  });
  alertas.filter((a) => !a.conferido).forEach((a) => desenharAlerta(regions, a, offset));
}

/**
 * D-998: o alerta é uma faixa no TOPO da onda, não um bloco cheio. Bloco cheio
 * é trecho que sai; a faixa marca um trecho que fica e pede checagem de fato.
 * Não captura o clique: clicar ali posiciona o player, como no resto da onda.
 */
function desenharAlerta(regions: RegionsInstance, alerta: AlertaConferir, offset: number) {
  const region = regions.addRegion({
    id: `alerta-${alerta.id}`,
    start: Math.max(0, alerta.inicio_seg - offset),
    end: Math.max(0.1, alerta.fim_seg - offset),
    color: 'transparent',
    drag: false,
    resize: false,
  });
  const el = elementoDa(region);
  if (!el) return;
  el.setAttribute('data-alerta-conferir', alerta.id);
  el.title = `Conferir: ${alerta.motivo}`;
  el.style.cssText += [
    ';pointer-events:none',
    'height:14px',
    'border-top:3px solid var(--wb-warn)',
    'background:repeating-linear-gradient(135deg, color-mix(in oklch, var(--wb-warn) 35%, transparent) 0 4px, transparent 4px 8px)',
    'z-index:4',
  ].join(';');
}
