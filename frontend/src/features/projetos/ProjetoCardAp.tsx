import { useNavigate } from 'react-router-dom';
import { Card, CardCorpo } from '@/components/ui/card';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/overflow-menu';
import { Progresso } from '@/components/ui/progresso';
import { Selo } from '@/components/ui/selo';
import { CapaDoProjetoCard } from '@/features/projetos/CapaDoProjetoCard';
import { limpezaDoProjeto } from '@/features/projetos/limpezaDoProjeto';
import { construirEtapas } from '@/features/projetos/PipelineProgress';
import { proximoPasso } from '@/features/projetos/proximoPasso';
import { RedesDoProjeto } from '@/features/projetos/RedesDoProjeto';
import { estadoDoProjeto, ROTULO_DO_SELO, TOM_DO_ESTADO } from '@/features/projetos/statusMaps';
import { useLimparArquivos, useRebaixarVideo, useRemoverProjeto } from '@/features/projetos/useProjetos';
import { cn, formatarDataLive } from '@/lib/utils';
import type { Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-599 · O card da Biblioteca. D-1148 (E-069 H-15; DIRECAO §5, §6 e §7.1): a roupa da
// Sala escura, em pé ("No ar há pouco", a lista completa) e deitado ("Esperando você").
//
// UM selo e UMA ação de texto por cartão (§7.1). A ação é o próximo passo da live
// (`proximoPasso`), a mesma frase da primária do "Continue". As três utilidades de
// mídia (limpar, baixar de novo, remover) moram no "⋯" (§5): tirá-las seria perder
// função; deixá-las como ícones soltos no pé era o ruído que a §6 manda tirar.
// A fita de seis ícones virou uma frase: "4 de 6 · falta Pós", com o ícone da etapa.
//
// As confirmações e os TEXTOS delas são os de antes, palavra por palavra (D-457/D-527).
// ─────────────────────────────────────────────────────────────────

// A frase da etapa acha o ícone pelo rótulo de `construirEtapas` (D-851).
export const ICONE_ETAPA: Record<string, IconName> = {
  Baixado: 'download',
  Analisado: 'brain',
  Bruto: 'scissors',
  Pós: 'clapperboard',
  Metadados: 'tags',
  Publicação: 'rocket',
};

function FraseDaEtapa({ projeto }: { projeto: Projeto }) {
  const etapas = construirEtapas(projeto);
  const feitas = etapas.filter((e) => e.estado === 'feito').length;
  const falta = etapas.find((e) => e.estado !== 'feito');
  return (
    <p className="flex items-center gap-1.5 text-pequeno text-fg-3" title={falta?.hint}>
      <Icon name={falta ? (ICONE_ETAPA[falta.label] ?? 'circle-dashed') : 'circle-check'} className="size-3.5" />
      <span className="num">
        {feitas} de {etapas.length}
      </span>
      <span>{falta ? `· falta ${falta.label}` : '· todas as etapas'}</span>
    </p>
  );
}

function useAcoesDeMidia(projeto: Projeto) {
  const remover = useRemoverProjeto();
  const limpar = useLimparArquivos();
  const rebaixar = useRebaixarVideo();
  const confirmacao = useConfirmacao();
  const rebaixando = Boolean(projeto.rebaixando_video) || rebaixar.isPending;
  const limpeza = limpezaDoProjeto(projeto);

  const pedirRemover = () =>
    confirmacao.executarOuPedir(
      {
        titulo: 'Remover projeto',
        detalhe: projeto.titulo_live,
        descricao: 'Esta ação não pode ser desfeita: o projeto e tudo o que ele carrega saem do app.',
        confirmLabel: 'Remover',
        tone: 'danger',
      },
      () => remover.mutate(projeto.id),
    );
  const pedirRebaixar = () =>
    confirmacao.executarOuPedir(
      {
        titulo: 'Baixar o vídeo de novo',
        detalhe: projeto.titulo_live,
        descricao: 'Transcrição, cortes e metadados são preservados — só o arquivo pesado volta.',
        confirmLabel: 'Baixar de novo',
      },
      () => rebaixar.mutate(projeto.id),
    );
  const pedirLimpar = () =>
    confirmacao.executarOuPedir(
      {
        titulo: 'Apagar os vídeos e áudios',
        detalhe: projeto.titulo_live,
        descricao:
          'Textos e metadados ficam.' +
          (projeto.fires_pendentes > 0
            ? ` Os ${projeto.fires_pendentes} Fire(s) pendente(s) guardam o bruto, os shorts e o vídeo ainda não publicado.`
            : ''),
        confirmLabel: 'Apagar mídia',
        tone: 'danger',
      },
      () => limpar.mutate({ id: projeto.id }),
    );

  const itens: OverflowMenuItem[] = [
    projeto.arquivos_limpos
      ? {
          icon: 'download',
          label: rebaixando ? 'Baixando o vídeo…' : 'Baixar o vídeo de novo',
          title: 'Preserva transcrição, cortes e metadados.',
          disabled: rebaixando,
          onClick: pedirRebaixar,
        }
      : {
          icon: 'sparkles',
          label: 'Limpar a mídia pesada',
          title: limpeza?.dica,
          // Baixando, o vídeo ainda está sendo gravado: limpar agora apagaria o que chega.
          disabled: limpar.isPending || !limpeza,
          onClick: pedirLimpar,
        },
    { icon: 'trash', label: 'Remover projeto', danger: true, disabled: remover.isPending, onClick: pedirRemover },
  ];
  return { itens, confirmacao };
}

export function ProjetoCardAp({ projeto, deitado = false }: { projeto: Projeto; deitado?: boolean }) {
  const navigate = useNavigate();
  const { itens, confirmacao } = useAcoesDeMidia(projeto);
  const estado = estadoDoProjeto(projeto).key;
  const passo = proximoPasso(projeto);
  const baixando = projeto.status === 'baixando';
  const abrir = () => navigate(`/projetos/${projeto.id}`);
  const nota = Math.round(projeto.pontuacao_ranking);
  const meta = [
    projeto.canal_origem,
    projeto.data_live ? formatarDataLive(projeto.data_live) : null,
    nota > 0 ? `nota ${nota}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Card variante={deitado ? 'deitado' : 'vidro'} role="article" aria-label={projeto.titulo_live || 'Sem título'}>
        <CapaDoProjetoCard projeto={projeto} abrir={abrir} className={deitado ? 'w-[168px]' : 'w-full'} />
        <CardCorpo className={cn(deitado && 'py-1')}>
          <h3 className="min-w-0">
            <button
              type="button"
              data-sala=""
              onClick={abrir}
              title={projeto.titulo_live}
              className="block min-h-6 w-full truncate rounded-etiqueta text-left text-linha text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
            >
              {projeto.titulo_live || 'Sem título'}
            </button>
          </h3>
          {meta && <p className="truncate text-pequeno text-fg-3">{meta}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Selo tom={TOM_DO_ESTADO[estado]}>
              {ROTULO_DO_SELO[estado]}
              {baixando ? ` ${Math.round(projeto.progresso_download)}%` : ''}
            </Selo>
            <span className="num text-pequeno text-fg-3">
              {projeto.total_cortes} cortes · {projeto.total_publicados} no ar
            </span>
          </div>
          {baixando && <Progresso valor={projeto.progresso_download} rotulo="Download da live" mostrarValor={false} />}
          {!deitado && <FraseDaEtapa projeto={projeto} />}
          {!deitado && <RedesDoProjeto projeto={projeto} />}
          <div className="flex items-center justify-between gap-2">
            <LinkDeAcao onClick={() => navigate(passo.to)}>{passo.texto}</LinkDeAcao>
            <OverflowMenu items={itens} label={`Mais ações da live ${projeto.titulo_live}`} />
          </div>
        </CardCorpo>
      </Card>

      <ConfirmDialog pedido={confirmacao.pedido} onCancel={confirmacao.cancelar} onConfirm={confirmacao.confirmar} />
    </>
  );
}
