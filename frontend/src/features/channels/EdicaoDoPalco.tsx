import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '@/components/ui/toaster';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import { mensagemErro } from '@/lib/mensagemErro';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import { Icon } from '@/upgrade/Icon';
import { PalcoComponentesForm, edicaoDe, rascunhoDe, type RascunhoDoPalco } from './PalcoComponentesSection';
import { paraComponentesDoPalco } from './palcoDoCanal';
import {
  useCanais,
  useEnviarImagemDoPalco,
  useGravarPalco,
  usePalcoDoCanal,
  useRemoverImagemDoPalco,
} from './useChannels';

// D-921: a edição do palco do canal — o rascunho, o salvar e a imagem — num
// hook só, para a tela de Canais e o modal de posição do pós usarem o MESMO
// formulário e o mesmo rascunho. O modal desenha a prévia a partir do
// rascunho (`componentes`), então cada mudança aparece antes de salvar.

/** O que a prévia desenha a partir do rascunho, antes de salvar. */
export function componentesDoRascunho(palco: PalcoComponentes, rascunho: RascunhoDoPalco): ComponentesDoPalco {
  const base = paraComponentesDoPalco(palco);
  const edicao = edicaoDe(rascunho);
  const handle = rascunho.handle.trim().replace(/^@+/, '');
  return {
    ...base,
    estilo: rascunho.estilo,
    fundo: rascunho.fundo,
    contorno_short: rascunho.contornoShort,
    fundo_short: rascunho.fundoShort,
    estilo_da_legenda: rascunho.estiloDaLegenda,
    cards: rascunho.cards,
    cabecalho: {
      ...base.cabecalho,
      ativo: rascunho.cabecalhoAtivo,
      // Vazio herda da identidade do canal, como no render.
      nome: rascunho.nome.trim() || base.cabecalho.nome,
      handle: handle ? `@${handle}` : base.cabecalho.handle,
      escala: rascunho.cabecalhoEscala,
      posicao: rascunho.cabecalhoPosicao,
      posicao_short: rascunho.cabecalhoPosicaoShort,
    },
    placa: { ...edicao.placa, ativo: rascunho.placaAtiva, escala: rascunho.placaEscala, posicao: rascunho.placaPosicao },
  };
}

export function useEdicaoDoPalco() {
  const { notify } = useToast();
  const canaisQuery = useCanais();
  const canalAtivo = canaisQuery.data?.canais.find((c) => c.ativo);
  const palcoQuery = usePalcoDoCanal(canalAtivo?.id);
  const gravar = useGravarPalco();
  const enviarImagem = useEnviarImagemDoPalco();
  const removerImagem = useRemoverImagemDoPalco();

  const [rascunho, setRascunho] = useState<RascunhoDoPalco | null>(null);
  const palco = palcoQuery.data;
  useEffect(() => {
    if (palco) setRascunho(rascunhoDe(palco));
  }, [palco]);

  const aoSalvar = () => {
    if (!canalAtivo || !rascunho) return;
    gravar.mutate(
      { canalId: canalAtivo.id, edicao: edicaoDe(rascunho) },
      {
        onSuccess: () =>
          notify('O próximo render já sai com o palco novo.', { tone: 'success', title: 'Palco salvo' }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao salvar o palco.'), { tone: 'error' }),
      },
    );
  };

  const formulario: ReactNode =
    canalAtivo && palco && rascunho ? (
      <PalcoComponentesForm
        rascunho={rascunho}
        palco={palco}
        pendente={gravar.isPending}
        enviandoImagem={enviarImagem.isPending || removerImagem.isPending}
        onMudar={setRascunho}
        onSalvar={aoSalvar}
        onEnviarImagem={(arquivo) =>
          enviarImagem.mutate(
            { canalId: canalAtivo.id, arquivo },
            { onError: (erro) => notify(mensagemErro(erro, 'Erro ao enviar a imagem.'), { tone: 'error' }) },
          )
        }
        onRemoverImagem={() =>
          removerImagem.mutate(canalAtivo.id, {
            onError: (erro) => notify(mensagemErro(erro, 'Erro ao remover a imagem.'), { tone: 'error' }),
          })
        }
      />
    ) : null;

  return {
    canaisQuery,
    canalAtivo,
    palcoQuery,
    formulario,
    /** O palco como o rascunho o desenharia (null enquanto carrega). */
    componentes: palco && rascunho ? componentesDoRascunho(palco, rascunho) : null,
  };
}

export function PalcoComponentesSection() {
  const { canaisQuery, canalAtivo, palcoQuery, formulario } = useEdicaoDoPalco();
  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div className="flex items-center gap-2">
        <Icon name="layout-template" size={20} className="text-[var(--wb-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Palco do canal</h2>
      </div>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O <strong>estilo</strong> do palco (fundo, molduras das janelas) e os componentes fixos que
        ele leva: o <strong>cabeçalho</strong> com imagem, nome e @, e a <strong>placa</strong> do
        interlocutor. Vale para o horizontal e para os shorts do <strong>canal ativo</strong>, no
        próximo render; a geometria das janelas continua a de cada corte.
      </p>
      <EstadoDoPalco canaisCarregados={canaisQuery.isSuccess} temCanal={Boolean(canalAtivo)} palcoQuery={palcoQuery} />
      {formulario}
    </section>
  );
}

/** Carregando, sem canal ativo ou erro: o que aparece no lugar do formulário. */
export function EstadoDoPalco({
  canaisCarregados,
  temCanal,
  palcoQuery,
}: {
  canaisCarregados: boolean;
  temCanal: boolean;
  palcoQuery: { isLoading: boolean; isError: boolean; error: unknown };
}) {
  if (canaisCarregados && !temCanal) {
    return <p className="text-sm text-[var(--wb-text-dim)]">Nenhum canal ativo. Selecione um canal para editar o palco.</p>;
  }
  if (palcoQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--wb-text-mute)]">
        <Icon name="loader-2" size={16} className="animate-spin" />
        Carregando o palco…
      </p>
    );
  }
  if (palcoQuery.isError) {
    return <p className="text-sm text-[var(--wb-err)]">{mensagemErro(palcoQuery.error, 'Não foi possível carregar o palco.')}</p>;
  }
  return null;
}

/**
 * D-921: o palco do canal dentro de um modal (o de posição do pós e o do palco
 * do short) — o mesmo formulário da tela de Canais. A prévia do modal desenha o
 * rascunho, então a mudança aparece antes de salvar; salvar vale para o canal.
 */
export function PalcoDoCanalNoModal({ edicao }: { edicao: ReturnType<typeof useEdicaoDoPalco> }): ReactNode {
  return (
    <details className="mt-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2" open>
      <summary className="cursor-pointer font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        Palco do canal — estilo e componentes
      </summary>
      <p className="my-2 text-[11.5px] leading-snug text-[var(--wb-text-mute)]">
        A prévia ao lado mostra o que você muda aqui. <strong>Salvar palco</strong> vale para o canal
        inteiro (todos os cortes e shorts), como na tela de Canais; o fundo acima só vale no estilo de
        sempre.
      </p>
      <EstadoDoPalco
        canaisCarregados={edicao.canaisQuery.isSuccess}
        temCanal={Boolean(edicao.canalAtivo)}
        palcoQuery={edicao.palcoQuery}
      />
      {edicao.formulario}
    </details>
  );
}
