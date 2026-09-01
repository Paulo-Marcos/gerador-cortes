import type { ElegibilidadeShorts } from '@/features/shorts/shortsApi';

// D-472: o que a seção da fábrica oferece, dado o estado do corte.
//
// Regra, não JSX — por isso mora aqui e não dentro do componente. São três
// decisões, e cada uma tem um porquê:
//
//   1. corte sem Fire não recebe oferta nenhuma. Mostrar um botão que vai ser
//      recusado é pior que não mostrar;
//   2. sem bruto em disco, o rótulo AVISA que haverá regeração antes. O clique
//      dispara um render de vários minutos — quem clica precisa saber disso;
//   3. candidatos já existentes viram aviso, porque regerar substitui os
//      sugeridos (os aprovados e rejeitados sobrevivem, D-454).

export interface PlanoFabrica {
  oferecer: boolean;
  rotulo: string;
  avisos: string[];
}

const PLANO_OCULTO: PlanoFabrica = { oferecer: false, rotulo: '', avisos: [] };

export function planoDaFabrica(estado: ElegibilidadeShorts | undefined): PlanoFabrica {
  if (!estado?.is_fire) return PLANO_OCULTO;

  const avisos: string[] = [];
  if (!estado.tem_bruto) {
    avisos.push(
      'O bruto foi descartado. Ele sera refeito primeiro — so o video, sem tocar em cenas, metadados ou pos-producao.',
    );
  }
  if (estado.total_shorts > 0) {
    avisos.push(
      `${estado.total_shorts} candidato(s) ja existem. Os que voce aprovou ou rejeitou continuam; so os sugeridos sao substituidos.`,
    );
  }

  return {
    oferecer: true,
    rotulo: estado.tem_bruto ? 'Gerar shorts' : 'Regerar bruto e gerar shorts',
    avisos,
  };
}
