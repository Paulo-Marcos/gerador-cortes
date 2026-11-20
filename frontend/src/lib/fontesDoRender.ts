import { useEffect, useState } from 'react';

// D-1139 (E-069 H-05) · as fontes do VÍDEO carregam só quando uma prévia as pede.
//
// Antes o `index.html` pedia as cinco da legenda (Anton, Bebas Neue, Montserrat,
// Poppins, Oswald) a toda abertura do app, mesmo em quem nunca abre um short.
// Agora a prévia que desenha com elas chama `carregarFontesDoRender` e só pinta
// depois que o navegador as tem — senão o operador aprova a legenda na fonte de
// reserva e recebe outra no arquivo (o mesmo risco da D-563).
//
// As do preset do Remotion (Inter, Lora, IBM Plex…) NÃO passam por aqui: o
// `FontPresetProvider` do renderer já as carrega sob demanda (D-642).

/** Famílias da legenda → pesos que o render usa (`LegendaShort.tsx`). */
const PESOS: Record<string, string> = {
  Anton: '400',
  'Bebas Neue': '400',
  Montserrat: '700;800;900',
  Poppins: '700;800',
  Oswald: '600;700',
};

export const FAMILIAS_DO_RENDER = Object.keys(PESOS);

const emAndamento = new Map<string, Promise<void>>();

function urlDe(familia: string): string {
  const nome = familia.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${nome}:wght@${PESOS[familia]}&display=swap`;
}

/** Põe a folha de estilo no <head> e espera ela chegar (ou falhar): só depois que
 *  as regras `@font-face` existem o navegador sabe baixar a fonte. */
function injetarLink(familia: string): Promise<void> {
  const href = urlDe(familia);
  const existente = document.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  if (existente) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

async function carregarUma(familia: string): Promise<void> {
  await injetarLink(familia);
  const peso = PESOS[familia].split(';')[0];
  // `document.fonts.load` baixa o arquivo da fonte. Sem rede, falha: a prévia cai
  // na fonte de reserva.
  await document.fonts.load(`${peso} 16px "${familia}"`);
}

/** Carrega (uma vez só por família) as fontes do vídeo pedidas. Nunca rejeita:
 *  fonte que não chega deixa a prévia na fonte de reserva, não a quebra. */
export function carregarFontesDoRender(familias: readonly string[]): Promise<void> {
  const validas = familias.filter((f) => f in PESOS);
  if (validas.length === 0) return Promise.resolve();
  return Promise.all(
    validas.map((familia) => {
      let promessa = emAndamento.get(familia);
      if (!promessa) {
        promessa = carregarUma(familia).catch(() => {
          // Esquece a falha: abrir a prévia de novo tenta outra vez.
          emAndamento.delete(familia);
        });
        emAndamento.set(familia, promessa);
      }
      return promessa;
    }),
  ).then(() => undefined);
}

/** `true` quando as fontes pedidas já estão no navegador. Pedido vazio (a fonte
 *  do canal) nasce pronto. */
export function useFontesDoRender(familias: readonly string[]): boolean {
  const chave = familias.filter((f) => f in PESOS).join('|');
  const [prontaChave, setProntaChave] = useState<string | null>(chave === '' ? '' : null);
  useEffect(() => {
    if (chave === '') return;
    let vivo = true;
    void carregarFontesDoRender(chave.split('|')).then(() => {
      if (vivo) setProntaChave(chave);
    });
    return () => {
      vivo = false;
    };
  }, [chave]);
  return chave === '' || prontaChave === chave;
}

/** Só para teste: esquece o que já foi pedido. */
export function esquecerFontesDoRender(): void {
  emAndamento.clear();
}
