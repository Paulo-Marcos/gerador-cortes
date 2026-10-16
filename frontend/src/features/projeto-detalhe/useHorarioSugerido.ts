// D-934: o envio de UM corte já abre com o próximo horário livre da janela.
//
// A agenda de um item só é a mesma conta do lote: o backend parte do último já
// agendado naquele destino e devolve a primeira vaga dos blocos do canal. O
// operador continua podendo trocar ou apagar (apagado, o YouTube publica agora).
import { useEffect, useState } from 'react';
import { loteApi } from '@/features/shorts/loteApi';
import { sugestaoDeHorario } from '@/features/shorts/agendamentoDoLote';

// A agenda de um item não depende de QUAL corte é: o alvo só rotula a linha.
const ALVO_AVULSO = 'corte:avulso';

type Aplicar = (mudar: (atual: string) => string) => void;
type Buscar = (plataforma: string) => Promise<string>;

/** A primeira vaga da janela do canal neste destino, ou vazio se não houver. */
export async function proximoHorarioLivre(plataforma: string): Promise<string> {
  const { itens } = await loteApi.preverAgenda([ALVO_AVULSO], [plataforma]);
  return itens.find((linha) => linha.agendar_para)?.agendar_para ?? '';
}

/**
 * Pede a vaga e a põe no campo — só se ele ainda estiver vazio: o que o
 * operador digitou não é sobrescrito. Devolve o cancelamento: a resposta de um
 * corte que já foi trocado por outro não pode cair no campo do novo.
 */
export function sugerirHorario(aplicar: Aplicar, buscar: Buscar = proximoHorarioLivre) {
  let vale = true;
  buscar('youtube').then(
    (vaga) => vale && vaga && aplicar((atual) => atual || vaga),
    () => undefined,
  );
  return () => {
    vale = false;
  };
}

/**
 * Liga a data com a sugestão de sempre e a troca pela vaga da janela quando ela
 * chega — mas só se o operador não mexeu na data nesse meio-tempo.
 */
export function marcarComVaga(
  plataforma: string,
  aplicar: Aplicar,
  buscar: Buscar = proximoHorarioLivre,
  provisoria: string = sugestaoDeHorario(),
) {
  aplicar(() => provisoria);
  buscar(plataforma).then(
    (vaga) => vaga && aplicar((atual) => (atual === provisoria ? vaga : atual)),
    () => undefined,
  );
}

/** A data do envio ao YouTube, preenchida com a sugestão a cada corte aberto. */
export function useHorarioSugerido(corte: { corte_id: string } | null) {
  const [valor, setValor] = useState('');
  const corteId = corte?.corte_id ?? null;

  useEffect(() => (corteId ? sugerirHorario(setValor) : undefined), [corteId]);

  return [valor, setValor] as const;
}

/** A data dos envios avulsos do TikTok: ligar o "Marcar dia e hora" traz a vaga. */
export function useDataDoAvulso(plataforma: string) {
  const [valor, setValor] = useState('');

  function marcar(ligar: boolean) {
    if (!ligar) return setValor('');
    marcarComVaga(plataforma, setValor);
  }

  return [valor, setValor, marcar] as const;
}
