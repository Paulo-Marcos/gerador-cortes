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

/** A primeira vaga da janela do canal neste destino, ou vazio se não houver. */
export async function proximoHorarioLivre(plataforma: string): Promise<string> {
  const { itens } = await loteApi.preverAgenda([ALVO_AVULSO], [plataforma]);
  return itens.find((linha) => linha.agendar_para)?.agendar_para ?? '';
}

/**
 * A data do envio ao YouTube, preenchida com a sugestão a cada corte aberto.
 *
 * Só preenche o campo vazio: o que o operador já digitou não é sobrescrito. Sem
 * resposta do backend, o campo fica vazio, como sempre ficou.
 */
export function useHorarioSugerido(corte: { corte_id: string } | null) {
  const [valor, setValor] = useState('');
  const corteId = corte?.corte_id ?? null;

  useEffect(() => {
    if (!corteId) return;
    let vale = true;
    proximoHorarioLivre('youtube').then(
      (quando) => vale && quando && setValor((atual) => atual || quando),
      () => undefined,
    );
    return () => {
      vale = false;
    };
  }, [corteId]);

  return [valor, setValor] as const;
}

/**
 * A data dos envios avulsos do TikTok: ligar o "Marcar dia e hora" traz a
 * próxima vaga da janela — e, até ela chegar, a sugestão de sempre.
 */
export function useDataDoAvulso(plataforma: string) {
  const [valor, setValor] = useState('');

  function marcar(ligar: boolean) {
    if (!ligar) return setValor('');
    const provisoria = sugestaoDeHorario();
    setValor(provisoria);
    // Só troca a provisória: se o operador já mexeu na data, a dele manda.
    proximoHorarioLivre(plataforma).then(
      (quando) => quando && setValor((atual) => (atual === provisoria ? quando : atual)),
      () => undefined,
    );
  }

  return [valor, setValor, marcar] as const;
}
