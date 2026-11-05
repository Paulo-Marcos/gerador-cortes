import { useEffect, useState } from 'react';
import type { MetadadoPatch } from './api/metadados';

// D-1064: trocar de corte recria o card (`UmaTelaPorCorte`, D-1033) e fechar o modal o desmonta,
// enquanto o Regerar segue no servidor. A versão anterior morava no card e morria com ele: o
// texto da IA ficava gravado sem volta. Agora mora aqui, numa gaveta por corte, e o card novo
// a encontra. Basta durar até recarregar a página, como o resto do que está em memória.

type CardAberto = {
  textoNaoSalvo: () => MetadadoPatch;
  descartarRascunho: () => void;
  avisar: (oferta: MetadadoPatch | null) => void;
};

type Gaveta = {
  /** O que o último Regerar pediu para reescrever; `null` no Completar, que não reescreve. */
  versaoEmVoo: { current: MetadadoPatch | null };
  /** O que a faixa do Desfazer oferece, até o operador desfazer, manter ou regerar de novo. */
  oferta: MetadadoPatch | null;
  cards: Set<CardAberto>;
};

// Por cliente de query, que é único no app: dura o mesmo que o cache dos metadados.
const GAVETAS = new WeakMap<object, Map<string, Gaveta>>();

function abrirGaveta(cliente: object, corteId: string): Gaveta {
  const doCliente = GAVETAS.get(cliente) ?? new Map<string, Gaveta>();
  GAVETAS.set(cliente, doCliente);
  const gaveta = doCliente.get(corteId) ?? { versaoEmVoo: { current: null }, oferta: null, cards: new Set() };
  doCliente.set(corteId, gaveta);
  return gaveta;
}

export function useVersaoDoDesfazer(
  cliente: object,
  corteId: string,
  rascunho: Pick<CardAberto, 'textoNaoSalvo' | 'descartarRascunho'>,
) {
  const gaveta = abrirGaveta(cliente, corteId);
  // A gaveta é quem sabe a oferta; este estado só redesenha o card quando ela muda.
  const [, setDesfazerIa] = useState(gaveta.oferta);

  // Sem dependências: o card aberto responde sempre com o rascunho do último desenho.
  useEffect(() => {
    const card: CardAberto = { ...rascunho, avisar: (oferta) => setDesfazerIa(oferta) };
    gaveta.cards.add(card);
    return () => {
      gaveta.cards.delete(card);
    };
  });

  return {
    desfazerIa: gaveta.oferta,
    setDesfazerIa,
    versaoAntesDaIa: gaveta.versaoEmVoo,
    dispensarDesfazer: () => {
      gaveta.oferta = null;
      gaveta.cards.forEach((card) => card.avisar(null));
    },
    /**
     * A geração terminou, e quem pediu pode já nem existir. Regerar substitui de propósito:
     * o rascunho de quem está no corte dá lugar à IA e volta no Desfazer (D-1054). Completar
     * não tem versão: não oferece nada e deixa o rascunho.
     */
    terminarGeracao: () => {
      const versao = gaveta.versaoEmVoo.current;
      const abertos = [...gaveta.cards];
      gaveta.oferta = versao && Object.assign({}, versao, ...abertos.map((card) => card.textoNaoSalvo()));
      for (const card of abertos) {
        if (versao) card.descartarRascunho();
        card.avisar(gaveta.oferta);
      }
      return gaveta.oferta;
    },
  };
}
