import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { api, dados } from '@/shared/api';
import {
  shortsDoCorteKey,
  useDefinirGanchoPadrao,
  useGanchoPadrao,
  useSeguirGanchoPadrao,
} from './useShortsDoCorte';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

// D-594: o gancho que vale para TODOS os shorts deste corte.
//
// "A opção de definir qual o padrão do gancho, bem como cor, tipo de fonte etc.
// Tem que ser no mesmo estilo do palco. Deixar criar preset, dar nome, editar.
// Até porque isso em geral é aplicado a todos."
//
// Mesmo desenho do `PalcoPadraoDoCorte`, e de propósito: são duas perguntas
// irmãs ("como a tela monta" e "como o letreiro aparece"), e o operador que
// aprendeu uma não deveria reaprender a outra.
//
// O aviso de "customizados" existe por uma herança do passado: até a D-594,
// gravar o gancho num trecho carimbava o véu e os 2,5s nele — e um trecho
// carimbado não segue padrão nenhum. Sem o aviso, escolher um preset aqui
// pareceria não fazer nada justamente nos trechos que já tinham gancho.
//
// D-901: um degrau acima, o padrão do CANAL. "Toda vez eu tenho que escolher
// qual modelo do gancho" — agora o corte que não escolhe o seu (a opção vazia
// do select) herda o do canal, e a estrela marca qual é. A herança é resolvida
// no backend, na leitura: trocar o do canal muda todo corte que não escolheu.

const GANCHO_DO_CANAL_KEY = ['shorts', 'gancho-padrao-do-canal'] as const;
const URL_DO_CANAL = '/api/presets/gancho/padrao-do-canal';

function useGanchoDoCanal() {
  return useQuery({
    queryKey: GANCHO_DO_CANAL_KEY,
    queryFn: async () => (await dados(api.GET(URL_DO_CANAL))).preset_id,
  });
}

/** Muda o padrão do canal: o gancho RESOLVIDO de todo corte que herda muda junto. */
function useEscolherGanchoDoCanal(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => dados(api.PUT(URL_DO_CANAL, { body: { preset_id: presetId } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GANCHO_DO_CANAL_KEY });
      // O prefixo de `ganchoPadraoKey`: o padrão resolvido de TODO corte aberto.
      void qc.invalidateQueries({ queryKey: ['shorts', 'gancho-padrao'] });
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
    },
  });
}

interface Props {
  corteId: string;
  /** `null` = criar um preset novo. */
  onEditar: (presetId: string | null) => void;
}

export function GanchoPadraoDoCorte({ corteId, onEditar }: Props) {
  const padrao = useGanchoPadrao(corteId);
  const definir = useDefinirGanchoPadrao(corteId);
  const seguir = useSeguirGanchoPadrao(corteId);
  const doCanal = useGanchoDoCanal();
  const escolherDoCanal = useEscolherGanchoDoCanal(corteId);

  if (padrao.isLoading || padrao.isError) return null;

  const escolhido = padrao.data?.gancho_padrao ?? '';
  const canal = doCanal.data ?? '';
  // O que vale no corte: o dele, ou o do canal quando ele segue o canal.
  const efetivo = escolhido || canal;
  const ehDoCanal = Boolean(efetivo) && efetivo === canal;
  const disponiveis = padrao.data?.disponiveis ?? [];
  const nomeDoCanal = disponiveis.find((p) => p.id === canal)?.nome;
  const customizados = padrao.data?.customizados ?? 0;

  const fazerTodosSeguirem = () => {
    const pergunta =
      `${customizados} ${customizados === 1 ? 'trecho tem' : 'trechos têm'} cor, destaque ou ` +
      'duração próprios. Eles passam a seguir o gancho padrão do corte — o TEXTO de cada ' +
      'gancho continua como está. Continuar?';
    if (confirm(pergunta)) seguir.mutate();
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex w-[58px] items-center gap-1 font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          <Icon name="type" />
          gancho
        </span>

        <select
          aria-label="Gancho padrão deste corte — cor, destaque, fonte, tamanho e duração"
          value={escolhido}
          disabled={definir.isPending}
          onChange={(e) => definir.mutate(e.target.value)}
          className="h-7 max-w-[190px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          <option value="">{nomeDoCanal ? `padrão do canal (${nomeDoCanal})` : 'cada trecho decide'}</option>
          {disponiveis.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.nome}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant="ghost"
          disabled={!efetivo || escolherDoCanal.isPending}
          aria-pressed={ehDoCanal}
          title={
            ehDoCanal
              ? 'É o gancho padrão do canal — clique para o canal deixar de ter padrão.'
              : 'Todo corte que não escolher o próprio gancho passa a usar este.'
          }
          onClick={() => escolherDoCanal.mutate(ehDoCanal ? '' : efetivo)}
        >
          <Icon name="star" className={ehDoCanal ? 'fill-current text-[var(--wb-accent)]' : undefined} />
          {ehDoCanal ? 'do canal' : 'padrão do canal'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!efetivo}
          aria-label="Editar o gancho padrão"
          onClick={() => onEditar(efetivo)}
        >
          <Icon name={ICONE_DO_CONCEITO.editar} />
          editar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEditar(null)}>
          <Icon name="plus" />
          novo
        </Button>
      </div>

      {efetivo && customizados > 0 && (
        <p className="pl-[64px] text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          {customizados} {customizados === 1 ? 'trecho não segue' : 'trechos não seguem'} o padrão.{' '}
          <button
            type="button"
            disabled={seguir.isPending}
            onClick={fazerTodosSeguirem}
            className="text-[var(--wb-accent)] underline-offset-2 hover:underline disabled:opacity-45"
          >
            fazer todos seguirem
          </button>
        </p>
      )}
    </div>
  );
}
