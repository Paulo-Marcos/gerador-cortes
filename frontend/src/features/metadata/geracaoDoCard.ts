import { geracaoIaApi } from '@/features/ia';
import type { MetadadoCorte } from '@/types/models';

type Textos = Pick<MetadadoCorte, 'titulo_youtube' | 'descricao_youtube' | 'texto_capa' | 'tags_youtube'>;

/**
 * D-1043: com título e sem descrição, a IA completa e o título fica. Só com os dois
 * preenchidos há o que regerar, e regerar reescreve tudo (com o Desfazer da D-746).
 */
function estaCompleto(meta: Partial<Textos> | undefined): boolean {
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

/** O que o Desfazer devolve. Completar não reescreve nada: não há o que desfazer. */
export function versaoParaDesfazer(meta: Partial<Textos> | undefined) {
  if (!meta || !estaCompleto(meta)) return null;
  return {
    titulo_youtube: meta.titulo_youtube,
    texto_capa: meta.texto_capa,
    descricao_youtube: meta.descricao_youtube,
    tags_youtube: meta.tags_youtube,
  };
}
