// D-070: lógica pura da tela de padrões dos melhores prompts de thumbnail.
// Mantida fora do componente para ficar testável (rótulos e ordenação dos eixos).
import type { PadroaoEixoOcorrencia, PadroesCompilados } from '@/lib/api';

// Rótulos legíveis dos eixos das [VARIATION_TAGS] (espelham EIXOS no backend).
export const ROTULOS_EIXO: Record<string, string> = {
  cenario: 'Cenário',
  personagens: 'Elenco / personagens',
  relacao_mascote_personagens: 'Relação mascote × personagens',
  escala_mascote: 'Escala do mascote',
  camera: 'Câmera',
  pose: 'Pose',
  paleta: 'Paleta',
  luminosidade: 'Luz',
  tipografia: 'Tipografia',
  roupa: 'Roupa',
  layout_texto: 'Layout do texto',
  apoio_layout: 'Layout do apoio',
};

// Ordem de exibição dos eixos (mesma da skill do Capista).
const ORDEM_EIXOS = Object.keys(ROTULOS_EIXO);

export interface EixoComOcorrencias {
  eixo: string;
  rotulo: string;
  ocorrencias: PadroaoEixoOcorrencia[];
}

export function rotuloEixo(eixo: string): string {
  return ROTULOS_EIXO[eixo] ?? eixo;
}

/**
 * Lista apenas os eixos que têm ocorrências, na ordem da skill. Cada item já
 * traz o rótulo legível, pronto para render.
 */
export function eixosComOcorrencias(padroes: PadroesCompilados | null): EixoComOcorrencias[] {
  if (!padroes) return [];
  return ORDEM_EIXOS.filter((eixo) => (padroes.eixos[eixo]?.length ?? 0) > 0).map((eixo) => ({
    eixo,
    rotulo: rotuloEixo(eixo),
    ocorrencias: padroes.eixos[eixo],
  }));
}
