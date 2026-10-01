import type { TomDoSelo } from '@/upgrade/SeloDeEstado';
import type { ProgressoRender, ShortSugerido, StatusShort } from './shortsApi';

// D-492: o que a tela deve oferecer, dado o estado do candidato.
//
// O card tinha oito botões de peso visual idêntico, todos disponíveis o tempo
// todo. Isso não é "muitas opções": é a tela se recusando a ter opinião. Num
// candidato sugerido, aprovar é o que importa; num aprovado, renderizar; num
// pronto, publicar. Mostrar os três com o mesmo destaque obriga o operador a
// reconstruir essa ordem de cabeça, toda vez, em cada card.
//
// Aqui mora a decisão de hierarquia, fora do JSX, porque ela é regra e não
// desenho — e porque regra em JSX não se testa.

export interface AparenciaStatus {
  rotulo: string;
  tom: TomDoSelo;
}

/**
 * Como cada estágio se apresenta, no contrato do selo (D-746, D-848).
 *
 * Cor semântica, não decoração: `rejeitado` é inerte (uma decisão registrada,
 * não um erro), `renderizado` é ok (há arquivo), `aprovado` está em curso
 * (info) e `sugerido` pede um ato seu (aviso). Pintar rejeitado de vermelho
 * diria que algo deu errado, quando o operador apenas escolheu; e `aprovado`
 * no acento entrava na tinta dos botões.
 */
export const APARENCIA: Record<StatusShort, AparenciaStatus> = {
  sugerido: { rotulo: 'sugerido', tom: 'aviso' },
  aprovado: { rotulo: 'aprovado', tom: 'info' },
  rejeitado: { rotulo: 'rejeitado', tom: 'inerte' },
  renderizado: { rotulo: 'pronto', tom: 'ok' },
};

export type AcaoId =
  | 'aprovar'
  | 'rejeitar'
  | 'voltar'
  | 'previa'
  | 'refazerPrevia'
  | 'finalizar'
  | 'refazerFinal';

export interface PlanoDeAcoes {
  /** A ação que este estado pede. Uma só — é o que a define. */
  principal: AcaoId | null;
  /** Alternativas visíveis, com peso menor. */
  secundarias: AcaoId[];
  /** O que raramente se usa, e que não deve competir por atenção. */
  noMenu: AcaoId[];
}

/**
 * O que oferecer, e com que peso, para um candidato.
 *
 * `renderizando` some com as ações de produção: oferecer "finalizar" enquanto
 * um render corre é oferecer um clique que será recusado com 409.
 */
export function planoDeAcoes(short: ShortSugerido, renderizando: boolean): PlanoDeAcoes {
  if (renderizando) {
    return { principal: null, secundarias: [], noMenu: [] };
  }

  switch (short.status) {
    case 'sugerido':
      // Decidir vem antes de produzir: um candidato não julgado não tem por que
      // oferecer render.
      return { principal: 'aprovar', secundarias: ['rejeitar'], noMenu: [] };

    case 'aprovado':
      // Já decidido, falta o arquivo. A prévia é o passo barato e reversível,
      // então é ela que fica em destaque — finalizar custa a passada boa.
      return {
        principal: short.arquivo_previa_path ? 'finalizar' : 'previa',
        secundarias: short.arquivo_previa_path ? ['refazerPrevia'] : ['finalizar'],
        noMenu: ['voltar', 'rejeitar'],
      };

    case 'renderizado':
      // Há arquivo: o que resta é publicar (painel próprio) ou refazer.
      return { principal: null, secundarias: [], noMenu: ['refazerFinal', 'voltar'] };

    case 'rejeitado':
      // Um único caminho de volta. Nada mais faz sentido aqui.
      return { principal: null, secundarias: ['voltar'], noMenu: [] };

    default:
      // D-548: status que a tela não conhece não pode derrubá-la.
      //
      // Sem este ramo o `switch` devolve `undefined`, e quem chama faz
      // `plano.secundarias` — tela branca com stack trace, para o app inteiro,
      // por causa de UMA linha do banco. Aconteceu com um registro semeado à
      // mão, e o mesmo vale para uma linha antiga que sobreviveu a uma
      // migração de enum.
      //
      // Nenhuma ação é a resposta segura: o card ainda mostra o trecho, e o
      // operador vê que aquele ali está num estado que o app não sabe tratar.
      return { principal: null, secundarias: [], noMenu: [] };
  }
}

/**
 * A nota, como ela deve ser lida.
 *
 * O manual não tem nota da IA, e mostrar `0.0` o colocaria no fundo de uma fila
 * de que ele não participa (D-484).
 */
export function notaVisivel(short: ShortSugerido): string {
  return short.origem === 'manual' ? '—' : short.score.toFixed(1);
}

/**
 * O tom da nota — o sinal que o olho pega antes de ler o número.
 *
 * Os cortes de faixa vêm da leitura editorial que o programa já usa: acima de 8
 * é candidato forte, abaixo de 6 é o que só entra faltando material.
 */
export function tomDaNota(short: ShortSugerido): TomDoSelo {
  if (short.origem === 'manual') return 'inerte';
  if (short.score >= 8) return 'ok';
  // D-848: a faixa do meio era 'accent', a tinta dos botões; nota não se aperta.
  if (short.score >= 6) return 'info';
  return 'inerte';
}

/**
 * D-844: o render foi parado pela fila global?
 *
 * Pelo HTTP, cancelado e pronto chegam iguais — concluído e sem erro. O que os
 * separa são os passos: o pronto conclui os três. Sem esta distinção o painel
 * sumia no cancelamento como se o arquivo tivesse saído.
 */
export function foiCancelado({ concluido, erro, passos }: ProgressoRender): boolean {
  return concluido && !erro && passos.some((passo) => passo.status !== 'concluido');
}
