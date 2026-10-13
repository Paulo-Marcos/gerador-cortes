import React from "react";

/**
 * D-913: a palavra (ou o trecho) em destaque no gancho, marcada pelo operador
 * entre asteriscos no próprio texto — "Nietzsche não pedia *Game of Thrones*".
 *
 * A marca mora no texto, e não num campo à parte, para o destaque nunca
 * apontar para uma palavra que saiu do gancho: apagou a palavra, apagou a marca.
 * Só o PRIMEIRO par conta (um acento por quadro); sem par válido, o texto sai
 * como veio. Espelha `backend/app/domain/short/destaque_do_gancho.py`.
 *
 * Sem dependência de Remotion de propósito: a prévia do frontend usa este
 * mesmo componente, via public-api.
 */
export const MARCA_DO_DESTAQUE = "*";

export interface PartesDoGancho {
  antes: string;
  destaque: string;
  depois: string;
}

/** O texto partido no destaque, ou `null` quando não há um par de marcas válido. */
export function partesDoGancho(texto: string): PartesDoGancho | null {
  const abre = texto.indexOf(MARCA_DO_DESTAQUE);
  if (abre < 0) return null;
  const fecha = texto.indexOf(MARCA_DO_DESTAQUE, abre + 1);
  if (fecha < 0) return null;
  const destaque = texto.slice(abre + 1, fecha).trim();
  if (!destaque) return null;
  return {
    antes: texto.slice(0, abre),
    destaque,
    depois: texto.slice(fecha + 1).split(MARCA_DO_DESTAQUE).join(""),
  };
}

/** O texto sem as marcas, para onde ele aparece sem cor (capa, metadados). */
export function semMarcas(texto: string): string {
  return texto.split(MARCA_DO_DESTAQUE).join("").replace(/\s+/g, " ").trim();
}

/** O gancho com o trecho marcado na cor do destaque (o acento do canal). */
export const TextoComDestaque: React.FC<{ texto: string; cor: string }> = ({ texto, cor }) => {
  const partes = partesDoGancho(texto);
  if (!partes) return <>{semMarcas(texto)}</>;
  return (
    <>
      {partes.antes}
      <span style={{ color: cor }}>{partes.destaque}</span>
      {partes.depois}
    </>
  );
};
