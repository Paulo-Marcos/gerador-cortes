// D-934: a seção "Quando" do lote, do lado dos dados, para os lotes horizontais.
//
// O lote do YouTube longo e o do TikTok horizontal fazem a mesma pergunta que o
// lote de shorts (agora, uma data, ou distribuir pela janela do canal) e mostram
// a mesma resposta (`QuandoDoLote`). Aqui mora o estado dessa pergunta: o modo,
// a data única, a agenda que o backend calcula e se dá para publicar com ela.
import { useMemo, useState } from 'react';
import { problemasDasLinhas, resumoDaAgenda, type ModoDeQuando } from './agendaDoLote';
import {
  problemaDoHorario,
  sugestaoDeHorario,
  type NotaDeAgendamento,
} from './agendamentoDoLote';
import type { LinhaDaAgenda } from './loteApi';
import { useAgendaDoLote } from './useAgendaDoLote';
import { useAgora } from './useAgora';

interface Entrada {
  /** Os itens na ordem da tela, prefixados por tipo ("corte:uuid"). */
  alvos: string[];
  plataformas: string[];
  aberto: boolean;
  notas: NotaDeAgendamento[];
  /** Os horizontais nascem distribuindo: respeitar o público é o padrão (D-934). */
  modoInicial?: ModoDeQuando;
}

export function useQuandoDoLote({ alvos, plataformas, aberto, notas, modoInicial = 'agora' }: Entrada) {
  const [modo, setModo] = useState<ModoDeQuando>(modoInicial);
  const [agendarPara, setAgendarPara] = useState('');
  const [agora, acertarRelogio] = useAgora(aberto && modo !== 'agora');
  const agenda = useAgendaDoLote(alvos, plataformas, aberto && modo === 'distribuir');
  const problemas = useMemo(() => problemasDasLinhas(agenda.linhas, agora), [agenda.linhas, agora]);

  const problemaDoAgendamento =
    modo === 'uma_data' ? problemaDoHorario(agendarPara, plataformas, agora) : null;
  const resumo = resumoDaAgenda(agenda.linhas);
  // Sem linha com data não há o que publicar; com linha com problema, não ainda.
  const pronto =
    modo === 'agora' ||
    (modo === 'uma_data' && Boolean(agendarPara) && !problemaDoAgendamento) ||
    (modo === 'distribuir' && !agenda.carregando && problemas.size === 0 && resumo.comData > 0);

  return {
    modo,
    agendarPara: modo === 'uma_data' ? agendarPara : '',
    linhas: modo === 'distribuir' ? agenda.linhas : ([] as LinhaDaAgenda[]),
    pronto,
    /** Tudo o que `QuandoDoLote` pede, menos o rótulo de cada alvo. */
    secao: {
      modo,
      onModo: (novo: ModoDeQuando) => {
        acertarRelogio();
        setModo(novo);
        setAgendarPara(novo === 'uma_data' ? sugestaoDeHorario() : '');
      },
      agendarPara,
      onAgendarPara: (valor: string) => {
        acertarRelogio();
        setAgendarPara(valor);
      },
      problemaDoAgendamento,
      notas,
      linhas: agenda.linhas,
      carregandoAgenda: agenda.carregando,
      erroDaAgenda: agenda.erro,
      problemasDasLinhas: problemas,
      onAjustarLinha: (chave: string, valor: string) => {
        acertarRelogio();
        agenda.ajustar(chave, valor);
      },
      onRecalcular: agenda.recalcular,
    },
  };
}
