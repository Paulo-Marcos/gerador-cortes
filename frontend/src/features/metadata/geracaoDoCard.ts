import { useState } from 'react';
import { geracaoIaApi } from '@/features/ia';
import type { MetadadoCorte } from '@/types/models';
import type { MetadadoPatch } from './api/metadados';

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

/** O que o Regerar vai reescrever. O blur salva antes do clique, e o `meta` ainda não tem esse texto (D-1054). */
export function montarVersaoAnterior(meta: MetadadoCorte, naoSalvo: MetadadoPatch): MetadadoPatch {
  return {
    titulo_youtube: meta.titulo_youtube,
    texto_capa: meta.texto_capa,
    descricao_youtube: meta.descricao_youtube,
    tags_youtube: meta.tags_youtube,
    ...naoSalvo,
  };
}

/** D-1064: a oferta de Desfazer anda com o corte dela, e só esse corte a vê, mesmo indo e voltando. */
export function useOfertaDeDesfazer(corteId: string) {
  const [versaoOferecida, setDesfazerIa] = useState<MetadadoPatch | null>(null);
  const [corteDaOferta, setCorteDaOferta] = useState(corteId);
  return {
    desfazerIa: corteDaOferta === corteId ? versaoOferecida : null,
    setDesfazerIa,
    oferecerDesfazer: (corte: string, versao: MetadadoPatch | null) => {
      setCorteDaOferta(corte);
      setDesfazerIa(versao);
    },
  };
}
