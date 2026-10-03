import type { StatusCorte } from '@/types/models';

// Um corte `processado` (já renderizado) continua aprovado: só passou da
// etapa. A regra estava escrita em três lugares, e uma cópia que esquecia o
// `processado` fez o principal do editor dizer "Aprovar corte" num corte
// processado — e o clique o devolver a proposto (D-864).
const APROVADOS = new Set<StatusCorte>(['aprovado', 'processado']);

/** O corte está aprovado — inclusive se já foi processado. */
export function estaAprovado(status: StatusCorte): boolean {
  return APROVADOS.has(status);
}

/** O veredito alterna: aprovado (ou processado) volta a proposto; o resto é aprovado. */
export function statusAoAlternarVeredito(status: StatusCorte): StatusCorte {
  return estaAprovado(status) ? 'proposto' : 'aprovado';
}
