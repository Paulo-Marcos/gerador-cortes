import { ORIGEM_API } from '@/lib/apiBase';
import { COMPONENTES_PADRAO, type ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import type { PalcoComponentes } from '@/features/channels/api/canais';

// D-911: a resposta da API (com os campos crus e os efetivos) vira o que as
// prévias desenham — só os textos efetivos e a URL absoluta da imagem.

/** O que o palco mostra, a partir do que o canal gravou. */
export function paraComponentesDoPalco(resposta: PalcoComponentes | undefined): ComponentesDoPalco {
  if (!resposta) return COMPONENTES_PADRAO;
  return {
    estilo: resposta.estilo === 'limpo' ? 'limpo' : 'atual',
    cabecalho: {
      ativo: resposta.cabecalho.ativo,
      nome: resposta.cabecalho.nome_efetivo,
      handle: resposta.cabecalho.handle_efetivo,
      imagemUrl: urlDaImagem(resposta.cabecalho.imagem_url),
    },
    placa: { ativo: resposta.placa.ativo },
  };
}

/** A URL da imagem do cabeçalho, absoluta na origem da API (vazia sem imagem). */
export function urlDaImagem(relativa: string): string {
  if (!relativa) return '';
  return relativa.startsWith('http') ? relativa : `${ORIGEM_API}${relativa}`;
}
