// D-066: lógica pura da avaliação de thumbnail (rótulos, critérios e
// construção do payload). Mantida fora do componente para ficar testável.
import type { RegistrarAvaliacaoThumbnailBody, VeredictoThumbnail } from '@/types/models';

export const VEREDITOS: ReadonlyArray<{ value: VeredictoThumbnail; label: string }> = [
  { value: 'otimo', label: 'Ótimo' },
  { value: 'bom', label: 'Bom' },
  { value: 'regular', label: 'Regular' },
  { value: 'ruim', label: 'Ruim' },
];

// Critérios detalhados opcionais — espelham as qualidades que a skill
// `thumbnail-prompt-expert` busca: fiel à tese, clara, bonita, chamativa, honesta.
export const CRITERIOS: ReadonlyArray<{
  key: keyof Pick<
    RegistrarAvaliacaoThumbnailBody,
    'nota_fidelidade' | 'nota_clareza' | 'nota_beleza' | 'nota_impacto' | 'nota_honestidade'
  >;
  label: string;
}> = [
  { key: 'nota_fidelidade', label: 'Fiel à tese' },
  { key: 'nota_clareza', label: 'Clara' },
  { key: 'nota_beleza', label: 'Bonita' },
  { key: 'nota_impacto', label: 'Chamativa' },
  { key: 'nota_honestidade', label: 'Honesta' },
];

export type CriterioKey = (typeof CRITERIOS)[number]['key'];

export type NotasState = Partial<Record<CriterioKey, number | null>>;

export function rotuloVeredito(veredito: VeredictoThumbnail): string {
  return VEREDITOS.find((item) => item.value === veredito)?.label ?? veredito;
}

/**
 * Monta o corpo da requisição a partir do estado do formulário.
 * Notas ausentes ou fora de 1-5 viram `null` (critério não avaliado), de modo
 * que o caminho rápido — só o veredito — produz um payload válido sem critérios.
 */
export function montarPayloadAvaliacao(input: {
  veredito: VeredictoThumbnail;
  notas?: NotasState;
  comentario?: string;
}): RegistrarAvaliacaoThumbnailBody {
  const notas = input.notas ?? {};
  const nota = (key: CriterioKey): number | null => {
    const valor = notas[key];
    if (valor == null || valor < 1 || valor > 5) return null;
    return valor;
  };
  return {
    veredito: input.veredito,
    nota_fidelidade: nota('nota_fidelidade'),
    nota_clareza: nota('nota_clareza'),
    nota_beleza: nota('nota_beleza'),
    nota_impacto: nota('nota_impacto'),
    nota_honestidade: nota('nota_honestidade'),
    comentario: (input.comentario ?? '').trim(),
  };
}
