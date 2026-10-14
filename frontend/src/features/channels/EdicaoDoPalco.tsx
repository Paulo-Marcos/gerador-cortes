import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '@/components/ui/toaster';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import { mensagemErro } from '@/lib/mensagemErro';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import { Icon } from '@/upgrade/Icon';
import { PalcoComponentesForm, edicaoDe, rascunhoDe, type RascunhoDoPalco } from './PalcoComponentesSection';
import { paraComponentesDoPalco, urlDaImagem } from './palcoDoCanal';
import {
  useCanais,
  useEnviarImagemDoPalco,
  useGravarPalco,
  usePalcoDoCanal,
  useRemoverImagemDoPalco,
} from './useChannels';

// D-921: a edição do palco do canal — o rascunho, o salvar e a imagem — num
// hook só. A prévia sai do rascunho (`componentesDoRascunho`), que os modais de
// posição também usam para o palco do corte (D-923, `usePalcoDoModal`).

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
      // Vazio herda da identidade do canal, como no render; desligado some (D-923).
      nome: rascunho.mostrarNome ? rascunho.nome.trim() || palco.cabecalho.nome_efetivo : '',
      handle: rascunho.mostrarHandle ? (handle ? `@${handle}` : palco.cabecalho.handle_efetivo) : '',
      imagemUrl: rascunho.mostrarImagem ? urlDaImagem(palco.cabecalho.imagem_url) : '',
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
function EstadoDoPalco({
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
