import { geracaoIaApi } from '@/features/ia';
import type { MetadadoCorte } from '@/types/models';

type Textos = Pick<MetadadoCorte, 'titulo_youtube' | 'descricao_youtube'>;

/**
 * D-1043: com título e sem descrição, a IA completa e o título fica. Só com os dois
 * preenchidos há o que regerar, e regerar reescreve tudo: só aí há o que desfazer (D-746).
 */
export function estaCompleto(meta: Partial<Textos> | undefined): boolean {
  return Boolean(meta?.titulo_youtube && meta?.descricao_youtube);
}

export function rotuloDaGeracao(meta: Partial<Textos> | undefined): string {
  return estaCompleto(meta) ? 'Regerar metadados' : 'Completar metadados';
}

export function pedirGeracao(
  corteId: string,
  meta: Partial<Textos> | undefined,
  provider: 'claude' | 'gemini',
) {
  return estaCompleto(meta)
    ? geracaoIaApi.regerarMetadadosClaude(corteId, provider)
    : geracaoIaApi.gerarMetadadosClaude(corteId, provider);
}
