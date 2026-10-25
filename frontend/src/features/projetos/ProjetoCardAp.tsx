import { useNavigate } from 'react-router-dom';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { CapaDoProjetoCard } from '@/features/projetos/CapaDoProjetoCard';
import { limpezaDoProjeto } from '@/features/projetos/limpezaDoProjeto';
import { construirEtapas } from '@/features/projetos/PipelineProgress';
import { RedesDoProjeto } from '@/features/projetos/RedesDoProjeto';
import { useLimparArquivos, useRebaixarVideo, useRemoverProjeto } from '@/features/projetos/useProjetos';
import { formatarDataLive } from '@/lib/utils';
import type { Projeto } from '@/types/models';
import { Icon, type IconName } from '@/upgrade/Icon';
import { SeloDeEstado, TOM_DA_ETAPA, TOM_DA_LIMPEZA } from '@/upgrade/SeloDeEstado';

// ─────────────────────────────────────────────────────────────────
// D-599 · O card da Biblioteca na linguagem nova.
//
// Ele conta a live em três alturas de leitura, e a ordem é a ordem em
// que a pessoa decide: a miniatura diz QUE live é; a fita de seis
// ícones diz ONDE ela parou; a linha mono diz QUANTO ela rendeu. Só
// depois disso as ações fazem sentido — por isso ficam por último.
//
// A derivação de estado e de etapas vem de `statusMaps` e
// `PipelineProgress`, os mesmos do card atual. O que muda aqui é a
// roupa, não a regra: duas leituras diferentes do mesmo projeto seriam
// um bug esperando o operador comparar as telas.
//
// RODADA 2 · as três confirmações saíram do `confirm()` do sistema
// operacional para o `ConfirmDialog` da casca. O diálogo nativo não tem
// os tokens, não respeita tema nem vidro, e escapa das regras de overlay
// que o teclado da casca usa — numa delas o que está em jogo é a exclusão
// irreversível do projeto. O TEXTO é o mesmo, palavra por palavra: ele
// explica o que se perde e o que se preserva, e reescrevê-lo seria
// reabrir uma decisão já tomada (D-457/D-527).
// ─────────────────────────────────────────────────────────────────

// A fita do design usa os ícones da etapa, não o componente do lucide —
// o mapa fecha a ponte pelo rótulo, que é o mesmo nos dois lados.
export const ICONE_ETAPA: Record<string, IconName> = {
  Baixado: 'download',
  Analisado: 'brain',
  Bruto: 'scissors',
  Pós: 'clapperboard',
  Metadados: 'tags',
  Publicação: 'rocket',
};

export function ProjetoCardAp({ projeto, index = 0 }: { projeto: Projeto; index?: number }) {
  const navigate = useNavigate();
  const remover = useRemoverProjeto();
  const limpar = useLimparArquivos();
  const rebaixar = useRebaixarVideo();
  const confirmacao = useConfirmacao();

  const etapas = construirEtapas(projeto);
  const limpo = projeto.arquivos_limpos;
  const rebaixando = Boolean(projeto.rebaixando_video) || rebaixar.isPending;

  const abrir = () => navigate(`/projetos/${projeto.id}`);

  const aoRemover = () => {
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
  };

  const aoRebaixar = () => {
    if (rebaixando) return;
    confirmacao.executarOuPedir(
      {
        titulo: 'Baixar o vídeo de novo',
        detalhe: projeto.titulo_live,
        descricao:
          'Transcrição, cortes e metadados são preservados — só o arquivo pesado volta.',
        confirmLabel: 'Baixar de novo',
      },
      () => rebaixar.mutate(projeto.id),
    );
  };

  const aoLimpar = () => {
    if (limpo) return;
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
  };

  // "limpo" e "N fire" saíram daqui: o selo de limpeza diz as duas coisas.
  const limpeza = limpezaDoProjeto(projeto);
  const meta = [
    projeto.canal_origem?.replace('@', '') || 'canal',
    projeto.data_live ? formatarDataLive(projeto.data_live) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <article
        className="card"
        style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <CapaDoProjetoCard projeto={projeto} index={index} abrir={abrir} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 11 }}>
          <span style={{ minWidth: 0 }}>
            {/* O título abre a live, como a miniatura. No card atual o
                retângulo inteiro era clicável; aqui as ações moram dentro
                dele, então a área de abrir precisou virar explícita — e
                deixar só a miniatura clicável esconderia o caminho mais
                natural, que é clicar no nome. */}
            <button
              type="button"
              onClick={abrir}
              title={projeto.titulo_live}
              style={{
                display: 'block',
                width: '100%',
                padding: 0,
                border: 0,
                background: 'none',
                // R4: o título é o caminho mais usado para abrir a live e
                // tinha 18 px de altura clicável.
                minHeight: 24,
                fontSize: 13.5,
                fontWeight: 700,
                lineHeight: 1.3,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'pointer',
              }}
            >
              {projeto.titulo_live || 'Sem título'}
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span
                style={{
                  minWidth: 0,
                  flex: 1,
                  fontSize: 11.5,
                  color: 'var(--mute)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {meta}
              </span>
              {limpeza ? (
                <SeloDeEstado tom={TOM_DA_LIMPEZA[limpeza.chave]} dica={limpeza.dica}>
                  {limpeza.texto}
                </SeloDeEstado>
              ) : null}
            </span>
          </span>

          <div style={{ display: 'flex', gap: 3 }}>
            {etapas.map((e) => {
              const tom = TOM_DA_ETAPA[e.estado];
              return (
                <span
                  key={e.label}
                  title={`${e.label} — ${e.hint}`}
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    flex: 1,
                    height: 22,
                    borderRadius: 'var(--r1)',
                    background: tom.bg,
                    color: tom.cor,
                    boxShadow: tom.filete,
                    opacity: e.estado === 'pendente' ? 0.7 : 1,
                  }}
                >
                  <Icon name={ICONE_ETAPA[e.label] ?? 'circle-dashed'} />
                </span>
              );
            })}
          </div>

          {/* D-987 · "já subiu tudo?" fecha a leitura da fita: ela diz ONDE a
              live parou, e os chips dizem se o último passo terminou. Linha
              própria, e não ao lado de "N publicados": aquela linha mono já
              carrega as três ações do card e, a 300 px de grade, mais dois
              chips a estouram. */}
          <RedesDoProjeto projeto={projeto} />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--mute)',
            }}
          >
            <span>{projeto.total_cortes} cortes</span>
            <span style={{ color: 'var(--ok)' }}>{projeto.total_publicados} publicados</span>
            <span style={{ flex: 1 }} />

            {/* O design fecha o card com uma seta. Aqui a seta virou a
                própria ação de abrir, e ao lado dela ficam as três
                utilidades que o card atual já oferecia — tirá-las seria
                perder função em nome da estética. */}
            {limpo ? (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={aoRebaixar}
                disabled={rebaixando}
                title="Baixar o vídeo da live de novo. Preserva transcrição, cortes e metadados."
                aria-label="Baixar o vídeo da live de novo"
              >
                <Icon name={rebaixando ? 'loader' : 'download'} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={aoLimpar}
                disabled={limpar.isPending}
                title={
                  projeto.fires_pendentes > 0
                    ? `Limpar mídia pesada e preservar ${projeto.fires_pendentes} Fire(s) pendente(s)`
                    : 'Limpar mídia pesada: todos os Fires já estão resolvidos'
                }
                aria-label="Limpar mídia pesada"
              >
                <Icon name="sparkles" />
              </button>
            )}

            <button
              type="button"
              className="btn btn-icon"
              style={{ width: 24, height: 24, color: 'var(--err)' }}
              onClick={aoRemover}
              disabled={remover.isPending}
              title="Remover projeto"
              aria-label="Remover projeto"
            >
              <Icon name="trash" />
            </button>

            <button
              type="button"
              className="btn btn-icon"
              style={{ width: 24, height: 24 }}
              onClick={abrir}
              title="Abrir a live"
              aria-label="Abrir a live"
            >
              <Icon name="arrow-right" />
            </button>
          </div>
        </div>
      </article>

      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </>
  );
}
