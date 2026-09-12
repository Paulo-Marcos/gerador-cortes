// D-585: o fecho de um short — post e capa, encadeados.
//
// ## O problema
//
// O post e a capa eram dois botões dentro do `PainelPublicacao`, que só existe
// depois do render. Funcionava, e ainda assim o operador esbarrava sempre na
// mesma coisa: "eu SEMPRE vou querer os dois". Quando algo é sempre, oferecê-lo
// como opção é transferir para a pessoa o trabalho de lembrar — e lembrar é o
// que falha às onze da noite, no décimo short do dia.
//
// ## Por que o post abre JÁ, e a capa espera
//
// Não é preferência: é dependência.
//
// O post é texto. Ele não precisa do MP4, nunca precisou — é por isso que o
// `PainelPublicacao` já o mantinha fora dos early-returns da prévia. Então ele
// pode ser escrito enquanto o render corre, e esses minutos são exatamente o
// tempo morto que ele preenche.
//
// A capa é um QUADRO do vídeo: sem arquivo em disco não há de onde tirar.
// Abri-la junto seria abrir um modal que só sabe dizer "ainda não dá".
//
// Daí a sequência: Finalizar dispara o render e abre o post; fechar o post
// abre a capa SE o arquivo já chegou. Quando não chegou, o card passa a
// mostrar a capa como pendência — e aí é o próprio trabalho que cobra, em vez
// de depender da memória de quem opera.
import { useCallback, useState } from 'react';
import { CapaModal } from './CapaModal';
import { PostModal } from './PostModal';
import type { ShortSugerido } from './shortsApi';

/** Em que ponto do fecho o short está. */
export type EtapaDoFecho = 'nenhuma' | 'post' | 'capa';

export interface FechoDoShort {
  etapa: EtapaDoFecho;
  /** Abre o post sozinho — o clique no botão do painel. */
  abrirPost: () => void;
  /** Abre a capa sozinha — idem. */
  abrirCapa: () => void;
  /**
   * O gesto do "Finalizar": dispara o render E abre o post.
   *
   * Recebe o disparo em vez de chamá-lo, para o hook não precisar conhecer a
   * mutation — quem sabe renderizar é a tela, e este hook só sabe a ordem.
   */
  finalizar: (dispararRender: () => void) => void;
  /** Os dois modais, prontos para o componente pendurar no JSX. */
  modais: React.ReactNode;
}

/**
 * @param prontoParaCapa o MP4 já está em disco? Só então a capa faz sentido.
 */
export function useFechoDoShort(short: ShortSugerido, prontoParaCapa: boolean): FechoDoShort {
  const [etapa, setEtapa] = useState<EtapaDoFecho>('nenhuma');

  const abrirPost = useCallback(() => setEtapa('post'), []);
  const abrirCapa = useCallback(() => setEtapa('capa'), []);

  const finalizar = useCallback((dispararRender: () => void) => {
    dispararRender();
    setEtapa('post');
  }, []);

  // Fechar o post encadeia na capa — mas só quando há arquivo. A leitura de
  // `prontoParaCapa` acontece AQUI, no fechamento, e não no clique do
  // Finalizar: entre um e outro passaram-se os minutos do render, e é o estado
  // de agora que decide.
  const aoFecharPost = useCallback(() => {
    setEtapa(prontoParaCapa ? 'capa' : 'nenhuma');
  }, [prontoParaCapa]);

  const modais = (
    <>
      <PostModal open={etapa === 'post'} onClose={aoFecharPost} short={short} />
      <CapaModal open={etapa === 'capa'} onClose={() => setEtapa('nenhuma')} short={short} />
    </>
  );

  return { etapa, abrirPost, abrirCapa, finalizar, modais };
}
