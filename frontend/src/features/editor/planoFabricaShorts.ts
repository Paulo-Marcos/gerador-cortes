import type { ElegibilidadeShorts } from '@/features/shorts/shortsApi';

// D-472: o que a seção da fábrica oferece, dado o estado do corte.
//
// Regra, não JSX — por isso mora aqui e não dentro do componente. São três
// decisões, e cada uma tem um porquê:
//
//   1. corte fora da fábrica recebe o convite para ENTRAR nela, e não o botão
//      de gerar. Antes só o Fire era elegível e o resto não via nada; desde a
//      D-502 dá para indicar um corte à mão, e esconder essa porta obrigava o
//      operador a marcar Fire — mentindo sobre o corte inteiro — para chegar
//      num trecho bom dentro dele;
//   2. sem bruto em disco, o rótulo AVISA que haverá regeração antes. O clique
//      dispara um render de vários minutos — quem clica precisa saber disso;
//   3. candidatos já existentes viram aviso, porque regerar substitui os
//      sugeridos (os aprovados e rejeitados sobrevivem, D-454);
//   4. **falha NÃO é o mesmo que "não é Fire"** (D-473). Some sem explicação e
//      o operador não tem como distinguir "este corte não é Fire" de "o backend
//      não tem essa funcionalidade" — foi exatamente o que aconteceu com um
//      backend rodando código anterior ao endpoint. Falha aparece, e diz o que
//      fazer.

export interface PlanoFabrica {
  oferecer: boolean;
  rotulo: string;
  avisos: string[];
  /** D-502: o corte ainda não está na fábrica — oferecer entrar, não gerar. */
  convidar?: boolean;
  /** Mensagem de diagnóstico; quando presente, a seção mostra só ela. */
  indisponivel?: string;
}

const PLANO_OCULTO: PlanoFabrica = { oferecer: false, rotulo: '', avisos: [] };

export function planoDaFabrica(
  estado: ElegibilidadeShorts | undefined,
  { falhou = false }: { falhou?: boolean } = {},
): PlanoFabrica {
  if (falhou) {
    return {
      oferecer: false,
      rotulo: '',
      avisos: [],
      indisponivel:
        'Nao consegui checar a fabrica de shorts. Se o backend acabou de ser atualizado, reinicie-o.',
    };
  }
  if (!estado) return PLANO_OCULTO;

  // D-502: fora da fábrica, o que falta não é o bruto — é a decisão de que
  // este corte tem um trecho que vale. O botão diz isso.
  if (!estado.elegivel) {
    return {
      oferecer: true,
      convidar: true,
      rotulo: 'Indicar para shorts',
      avisos: [
        'Este corte não é Fire. Indicá-lo poe só ELE na fábrica de shorts, sem mudar o julgamento do corte.',
      ],
    };
  }

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
