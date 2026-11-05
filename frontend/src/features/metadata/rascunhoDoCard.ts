import { useEffect, useRef, useState } from 'react';
import type { MetadadoCorte } from '@/types/models';
import type { MetadadoPatch } from './api/metadados';

// D-1054: os quatro campos de texto do card. Um metadado novo chega por vários motivos
// (fim da geração, campo salvo, capa nova), e regravar a tela a cada um apagava o que o
// operador digitava sem ter saído do campo. A régua é o último metadado que chegou: o
// campo igual a ele não foi editado e recebe o novo; o diferente é rascunho e fica.

type Campos = { title: string; coverText: string; description: string; tagsText: string };
type Campo = keyof Campos;

const VAZIOS: Campos = { title: '', coverText: '', description: '', tagsText: '' };
const CAMPOS = Object.keys(VAZIOS) as Campo[];

export function sanitizeDescription(text: string) {
  return text ? text.replace(/#{2,}/g, '#') : text;
}

// A mesma quebra do `splitTags` do card, que a catraca de tamanho não deixa mover de lá.
const listaDeTags = (texto: string) =>
  texto
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

/** Como o texto seria gravado: "a,b" e "a, b" são a mesma lista, e não uma edição. */
const NA_FORMA_GRAVADA: Record<Campo, (texto: string) => string> = {
  title: (texto) => texto,
  coverText: (texto) => texto,
  description: sanitizeDescription,
  tagsText: (texto) => listaDeTags(texto).join(', '),
};

const PARA_GRAVAR: Record<Campo, (texto: string) => MetadadoPatch> = {
  title: (texto) => ({ titulo_youtube: texto }),
  coverText: (texto) => ({ texto_capa: texto }),
  description: (texto) => ({ descricao_youtube: sanitizeDescription(texto) }),
  tagsText: (texto) => ({ tags_youtube: listaDeTags(texto) }),
};

const mesmoTexto = (campo: Campo, a: string, b: string) =>
  NA_FORMA_GRAVADA[campo](a) === NA_FORMA_GRAVADA[campo](b);

function camposDoMetadado(meta: MetadadoCorte): Campos {
  return {
    title: meta.titulo_youtube,
    coverText: meta.texto_capa,
    description: sanitizeDescription(meta.descricao_youtube),
    tagsText: (meta.tags_youtube ?? []).join(', '),
  };
}

/** Sem base, é a primeira leitura deste corte: não há o que preservar. */
function mesclar(tela: Campos, base: Campos | null, chegou: Campos): Campos {
  const mesclado = { ...chegou };
  for (const campo of CAMPOS) {
    const editado = base !== null && !mesmoTexto(campo, tela[campo], base[campo]);
    // Igual ao que chegou é o próprio texto salvo voltando: vale a forma gravada.
    if (editado && !mesmoTexto(campo, tela[campo], chegou[campo])) mesclado[campo] = tela[campo];
  }
  return mesclado;
}

export function useRascunhoDoCard(corteId: string, meta: MetadadoCorte | undefined) {
  const [tela, setTela] = useState(VAZIOS);
  const chegada = useRef<{ corteId: string; campos: Campos } | null>(null);

  useEffect(() => {
    if (!meta) return;
    const chegou = camposDoMetadado(meta);
    const base = chegada.current?.corteId === corteId ? chegada.current.campos : null;
    chegada.current = { corteId, campos: chegou };
    setTela((atual) => mesclar(atual, base, chegou));
  }, [corteId, meta]);

  const trocar = (campo: Campo) => (texto: string) =>
    setTela((atual) => ({ ...atual, [campo]: texto }));
  const base = chegada.current?.campos ?? null;

  return {
    ...tela,
    setTitle: trocar('title'),
    setCoverText: trocar('coverText'),
    setDescription: trocar('description'),
    setTagsText: trocar('tagsText'),
    /** O que está na tela e não foi gravado, na forma de gravar. */
    textoNaoSalvo: (): MetadadoPatch => {
      if (!base) return {};
      const editados = CAMPOS.filter((campo) => !mesmoTexto(campo, tela[campo], base[campo]));
      return Object.assign({}, ...editados.map((campo) => PARA_GRAVAR[campo](tela[campo])));
    },
    /** Volta a tela ao último metadado: o próximo a chegar a ocupa inteira. */
    descartarRascunho: () => {
      if (base) setTela(base);
    },
  };
}
