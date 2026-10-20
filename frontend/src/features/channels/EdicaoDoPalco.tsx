import { useState } from 'react';
import { useToast } from '@/components/ui/toaster';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import type { EstiloDaCapaDoCanal } from '@/features/metadata/estiloDaCapaApi';
import { useEscolherEstiloDaCapaDoCanal, useEstiloDaCapaDoCanal } from '@/features/metadata/useEstiloDaCapa';
import { mensagemErro } from '@/lib/mensagemErro';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import { Icon } from '@/upgrade/Icon';
import { EstiloPorTipo, ImagemDoCabecalho, type TipoDoPadrao } from './EstiloDoCanal';
import { PadraoDoCanal } from './PadraoDoCanalModais';
import { edicaoDe, type RascunhoDoPalco } from './PalcoComponentesSection';
import { paraComponentesDoPalco, urlDaImagem } from './palcoDoCanal';
import {
  useCanais,
  useEnviarImagemDoPalco,
  useGravarPalco,
  usePalcoDoCanal,
  useRemoverImagemDoPalco,
} from './useChannels';

// D-921: o rascunho do palco vira a prévia (`componentesDoRascunho`), que os
// modais de posição usam (D-923, `usePalcoDoModal`). D-938: a seção do palco
// na tela de Canais só escolhe o estilo; o detalhe abre no modal do tipo.

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

export function PalcoComponentesSection() {
  const { notify } = useToast();
  const canaisQuery = useCanais();
  const canalAtivo = canaisQuery.data?.canais.find((c) => c.ativo);
  const palcoQuery = usePalcoDoCanal(canalAtivo?.id);
  const gravar = useGravarPalco();
  const enviarImagem = useEnviarImagemDoPalco();
  const removerImagem = useRemoverImagemDoPalco();
  const estiloDaCapa = useEstiloDaCapaDoCanal();
  const escolherEstiloDaCapa = useEscolherEstiloDaCapaDoCanal();
  const [modal, setModal] = useState<TipoDoPadrao | null>(null);
  const palco = palcoQuery.data;
  const erro = (texto: string) => (e: unknown) => notify(mensagemErro(e, texto), { tone: 'error' });

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div className="flex items-center gap-2">
        <Icon name="layout-template" size={20} className="text-[var(--wb-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Palco do canal</h2>
      </div>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O <strong>estilo</strong> de cada tipo no <strong>canal ativo</strong>. Vale no próximo render de todo corte
        que não escolheu o próprio.
      </p>
      <EstadoDoPalco canaisCarregados={canaisQuery.isSuccess} temCanal={Boolean(canalAtivo)} palcoQuery={palcoQuery} />
      {canalAtivo && palco && (
        <>
          <EstiloPorTipo
            estilo={palco.estilo === 'limpo' ? 'limpo' : 'atual'}
            estiloDaCapa={estiloDaCapa.data?.estilo as EstiloDaCapaDoCanal | undefined}
            onEstilo={(estilo) =>
              gravar.mutate({ canalId: canalAtivo.id, edicao: { estilo } }, { onError: erro('Erro ao trocar o estilo.') })
            }
            onEstiloDaCapa={(estilo) => escolherEstiloDaCapa.mutate(estilo, { onError: erro('Erro ao trocar o estilo da capa.') })}
            onEditar={setModal}
          />
          <ImagemDoCabecalho
            palco={palco}
            enviando={enviarImagem.isPending || removerImagem.isPending}
            onEnviar={(arquivo) => enviarImagem.mutate({ canalId: canalAtivo.id, arquivo }, { onError: erro('Erro ao enviar a imagem.') })}
            onRemover={() => removerImagem.mutate(canalAtivo.id, { onError: erro('Erro ao remover a imagem.') })}
          />
        </>
      )}
      {modal && <PadraoDoCanal tipo={modal} onClose={() => setModal(null)} />}
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
