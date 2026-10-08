import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AndamentoDoPedido } from '@/features/capa-chatgpt/GerarNoChatGPT';
import {
  pedidoEmVoo,
  useConfiguracaoCapaChatgpt,
  usePedidoDaCapa,
} from '@/features/capa-chatgpt/useCapaNoChatGPT';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { shortsApi, type ShortSugerido } from './shortsApi';
import {
  capaDoShortKey,
  shortsDoCorteKey,
  useGerarPromptDaCapa,
  usePromptDaCapa,
} from './useShortsDoCorte';

// D-900: o que não pede escolha, a um clique e sem modal.
//
// Capa e gancho exigiam abrir um modal, trocar de aba e esperar minutos de IA
// com ele aberto — dez vezes por live. O que o operador decide (qual quadro,
// qual das variações, onde o gancho fica) continua nos modais; o que ele só
// MANDA fazer vem para a lista.
//
// - Capa: o prompt escrito já põe a arte na fila do ChatGPT (D-899), e a
//   linha embaixo diz em que passo o robô está.
// - Gancho: a IA propõe as variações (guardadas no short, D-573) e a primeira
//   vira o texto — só em trecho SEM gancho: "Gerar com IA" nunca sobrescreve
//   o que já foi escrito. Trocar por outra variação é no modal.

interface Props {
  short: ShortSugerido;
  corteId: string;
  /** Há MP4 e ainda não há capa: o lembrete que levava ao modal da capa. */
  faltaCapa: boolean;
  onAbrirCapa: () => void;
}

export function AcoesRapidasDoShort({ short, corteId, faltaCapa, onAbrirCapa }: Props) {
  if (short.status === 'sugerido' || short.status === 'rejeitado') return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--wb-border-soft)] px-3 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <GerarCapaComIA shortId={short.id} />
        {!short.gancho_tela?.trim() && <GerarGancho short={short} corteId={corteId} />}
      </div>
      {faltaCapa && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbrirCapa();
          }}
          className="flex items-center gap-1.5 text-left text-[11.5px] text-[var(--wb-warn-ink)] hover:underline"
        >
          <Icon name="image" className="flex-none" />
          Falta escolher a capa — sem ela a plataforma pega um quadro qualquer.
        </button>
      )}
    </div>
  );
}

/**
 * Escreve o prompt da capa do short; o backend põe a arte na fila do ChatGPT
 * e a grava como a capa quando ela chega (D-898/D-899).
 */
export function GerarCapaComIA({
  shortId,
  aoConcluir,
  className,
}: {
  shortId: string;
  /** Além de reler a capa: quem mostra um resumo dela (a central) relê o seu. */
  aoConcluir?: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const config = useConfiguracaoCapaChatgpt();
  const prompt = usePromptDaCapa(shortId);
  const escrever = useGerarPromptDaCapa(shortId);
  const pedido = usePedidoDaCapa('short', shortId, prompt.data?.prompt.trim() ?? '', () => {
    void qc.invalidateQueries({ queryKey: capaDoShortKey(shortId) });
    aoConcluir?.();
  }).data;
  const robo = Boolean(config.data?.projeto_url);
  const ocupado = escrever.isPending || pedidoEmVoo(pedido);

  return (
    <div className={cn('grid gap-1', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={ocupado}
        onClick={(e) => {
          e.stopPropagation();
          escrever.mutate('claude');
        }}
        title={
          robo
            ? 'Escreve o prompt da capa e o robô gera a arte no ChatGPT — ela entra como a capa.'
            : 'Escreve o prompt da capa. Configure o ChatGPT em Canais para a arte vir sozinha.'
        }
      >
        {ocupado ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={ICONE_DO_CONCEITO.iaGera} />}
        {escrever.isPending ? 'Escrevendo o prompt…' : 'Gerar capa com IA'}
      </Button>
      {escrever.isError ? (
        <span role="alert" className="text-[11px] leading-snug text-error">
          {(escrever.error as Error).message}
        </span>
      ) : (
        <AndamentoDoPedido pedido={pedido} />
      )}
    </div>
  );
}

/** O texto que a IA grava: a primeira variação, e só se o trecho não tem gancho. */
export function ganchoParaGravar(atual: string | undefined, variacoes: string[]): string | null {
  if (atual?.trim()) return null;
  return variacoes.map((v) => v.trim()).find(Boolean) ?? null;
}

function GerarGancho({ short, corteId }: { short: ShortSugerido; corteId: string }) {
  const qc = useQueryClient();
  const escrever = useMutation({
    mutationFn: async () => {
      const { variacoes } = await shortsApi.sugerirGanchos(short.id);
      // Relido do cache: a IA leva minutos, e o operador pode ter escrito um
      // gancho no modal enquanto isso — esse vence.
      const lista = qc.getQueryData<{ shorts: ShortSugerido[] }>(shortsDoCorteKey(corteId));
      const atual = lista?.shorts.find((s) => s.id === short.id)?.gancho_tela ?? short.gancho_tela;
      const texto = ganchoParaGravar(atual, variacoes);
      if (texto) await shortsApi.atualizar(short.id, { gancho_tela: texto });
      return texto;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
  });

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={escrever.isPending}
        onClick={(e) => {
          e.stopPropagation();
          escrever.mutate();
        }}
        title="A IA escreve o gancho da abertura com o padrão do corte; as outras variações ficam no modal do gancho."
      >
        {escrever.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={ICONE_DO_CONCEITO.iaGera} />}
        {escrever.isPending ? 'Escrevendo o gancho…' : 'Gerar gancho'}
      </Button>
      {escrever.isError && (
        <span role="alert" className="text-[11px] leading-snug text-error">
          {(escrever.error as Error).message}
        </span>
      )}
      {escrever.isSuccess && !escrever.data && (
        <span className="text-[11px] leading-snug text-[var(--wb-text-mute)]">
          A IA não trouxe um gancho aproveitável. Tente de novo ou escreva no modal.
        </span>
      )}
    </div>
  );
}
