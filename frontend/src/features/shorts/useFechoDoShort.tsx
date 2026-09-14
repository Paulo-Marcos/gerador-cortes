// D-585: o fecho de um short — post e capa.
//
// ## O problema
//
// O post e a capa eram dois botões dentro do `PainelPublicacao`, que só existe
// depois do render. Funcionava, e ainda assim o operador esbarrava sempre na
// mesma coisa: "eu SEMPRE vou querer os dois". Quando algo é sempre, oferecê-lo
// como opção é transferir para a pessoa o trabalho de lembrar — e lembrar é o
// que falha às onze da noite, no décimo short do dia.
//
// ## Por que o post se escreve sozinho
//
// A D-585 abria o modal do post no Finalizar. Continuava sendo um pedido de
// licença: o operador tinha de clicar em "Escrever com a IA" para a IA fazer o
// que ele sempre ia pedir. Agora o Finalizar dispara o render E a escrita do
// post, sem modal — o texto não depende do MP4, então os minutos do render são
// justamente o tempo em que ele se escreve. Revisar continua a um clique, no
// painel de publicação; discordar é editar, não autorizar antes.
//
// Só escreve quando o short ainda NÃO tem post gerado (`escreverPostSeFaltar`).
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CapaModal } from './CapaModal';
import { PostModal } from './PostModal';
import { escreverPostSeFaltar } from './postDoShort';
import { shortsApi, type ShortSugerido } from './shortsApi';
import { postDoShortKey, useGerarPost } from './useShortsDoCorte';

/** Em que ponto do fecho o short está. */
export type EtapaDoFecho = 'nenhuma' | 'post' | 'capa';

export interface FechoDoShort {
  etapa: EtapaDoFecho;
  /** Abre o post para revisar — o clique no botão do painel. */
  abrirPost: () => void;
  /** Abre a capa — idem. */
  abrirCapa: () => void;
  /**
   * O gesto do "Finalizar": dispara o render e manda a IA escrever o post.
   *
   * Recebe o disparo em vez de chamá-lo, para o hook não precisar conhecer a
   * mutation — quem sabe renderizar é a tela, e este hook só sabe a ordem.
   */
  finalizar: (dispararRender: () => void) => void;
  /** Os dois modais, prontos para o componente pendurar no JSX. */
  modais: React.ReactNode;
}

export function useFechoDoShort(short: ShortSugerido): FechoDoShort {
  const [etapa, setEtapa] = useState<EtapaDoFecho>('nenhuma');
  const qc = useQueryClient();
  const { mutate: gerarPost } = useGerarPost(short.id);

  const abrirPost = useCallback(() => setEtapa('post'), []);
  const abrirCapa = useCallback(() => setEtapa('capa'), []);
  const fechar = useCallback(() => setEtapa('nenhuma'), []);

  const finalizar = useCallback(
    (dispararRender: () => void) => {
      dispararRender();
      void escreverPostSeFaltar(
        () =>
          qc.ensureQueryData({
            queryKey: postDoShortKey(short.id),
            queryFn: () => shortsApi.obterPost(short.id),
          }),
        gerarPost,
      );
    },
    [qc, short.id, gerarPost],
  );

  const modais = (
    <>
      <PostModal open={etapa === 'post'} onClose={fechar} short={short} />
      <CapaModal open={etapa === 'capa'} onClose={fechar} short={short} />
    </>
  );

  return { etapa, abrirPost, abrirCapa, finalizar, modais };
}
