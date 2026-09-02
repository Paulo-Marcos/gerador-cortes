import type { Retangulo } from './shortsApi';

// D-500: quem manda simular, quando, e qual resposta pode pintar a tela.
//
// O arraste dispara ~60 eventos de ponteiro por segundo. Traduzir um para um em
// requisição faria três estragos: enfileirar chamadas atrás do dedo, gastar o
// backend com posições que ninguém vai ver, e — o pior — deixar uma resposta
// atrasada chegar DEPOIS do soltar e repintar o palco com um rascunho já
// abandonado. Esse último é o bug de divergência silenciosa que já apareceu
// duas vezes neste épico (D-490, D-493), agora na forma de corrida.
//
// A regra que resolve os três é uma só, e é pura: um estado pequeno que decide
// o que disparar e o que aceitar. O hook em volta só liga isso ao React e ao
// relógio — que é onde os testes deste projeto não alcançam.

export type Ajustes = Record<string, Retangulo>;

/**
 * Intervalo mínimo entre simulações, em ms.
 *
 * ~12 por segundo: rápido o bastante para o olho ler como movimento contínuo,
 * raro o bastante para nenhuma resposta chegar fora de hora.
 */
export const INTERVALO_MS = 80;

export interface EstadoSimulacao {
  /** Sobe a cada soltar/descartar/troca de short: respostas de gerações antigas são lixo. */
  geracao: number;
  emVoo: boolean;
  ultimaEm: number;
  /** O movimento mais recente que ainda não virou chamada. */
  pendente: Ajustes | null;
}

export const INICIAL: EstadoSimulacao = {
  geracao: 0,
  emVoo: false,
  ultimaEm: 0,
  pendente: null,
};

export interface Decisao {
  estado: EstadoSimulacao;
  /** Ajustes a mandar para o backend agora, ou null para não fazer nada. */
  disparar: Ajustes | null;
}

/** Um movimento do ponteiro. */
export function aoMover(estado: EstadoSimulacao, ajustes: Ajustes, agora: number): Decisao {
  // Com uma chamada em voo ou dentro do intervalo, o movimento fica GUARDADO —
  // e substitui o anterior. A tela quer o último estado, não a fila inteira de
  // posições intermediárias.
  if (estado.emVoo || agora - estado.ultimaEm < INTERVALO_MS) {
    return { estado: { ...estado, pendente: ajustes }, disparar: null };
  }
  return { estado: { ...estado, emVoo: true, ultimaEm: agora, pendente: null }, disparar: ajustes };
}

export interface Resposta extends Decisao {
  /** Se esta resposta ainda descreve o arraste em curso. */
  pintar: boolean;
}

/** Uma chamada terminou — com plano ou com erro. */
export function aoResponder(
  estado: EstadoSimulacao,
  geracao: number,
  agora: number,
): Resposta {
  const atual = geracao === estado.geracao;
  const livre = { ...estado, emVoo: false };
  if (!atual || !livre.pendente) {
    return { estado: { ...livre, pendente: atual ? null : livre.pendente }, disparar: null, pintar: atual };
  }
  // O guardado vira a próxima chamada imediatamente: é o quadro de onde o dedo
  // está agora, e esperar mais um intervalo por ele só atrasaria a tela.
  return {
    estado: { ...livre, ultimaEm: agora, pendente: null },
    disparar: livre.pendente,
    pintar: atual,
  };
}

/**
 * Soltou o bloco.
 *
 * Para de simular, mas NÃO manda apagar o desenho: apagar aqui faria o palco
 * piscar de volta para a geometria antiga durante o intervalo entre o PATCH e o
 * refetch — o operador veria o próprio ajuste ser desfeito e voltar.
 */
export function aoSoltar(estado: EstadoSimulacao): EstadoSimulacao {
  return { ...estado, geracao: estado.geracao + 1, pendente: null };
}

/** O plano gravado chegou (ou a gravação falhou): o rascunho perdeu a função. */
export function aoDescartar(estado: EstadoSimulacao): EstadoSimulacao {
  return { ...estado, geracao: estado.geracao + 1, pendente: null };
}
