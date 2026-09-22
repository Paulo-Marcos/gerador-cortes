import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { limpezaDoProjeto } from '@/features/projetos/limpezaDoProjeto';
import { construirEtapas } from '@/features/projetos/PipelineProgress';
import { estadoDoProjeto } from '@/features/projetos/statusMaps';
import { useLimparArquivos, useRebaixarVideo, useRemoverProjeto } from '@/hooks/useProjetos';
import { formatarDataLive, formatarDuracao, thumbnailUrl } from '@/lib/utils';
import type { Projeto } from '@/types/models';
import { Icon, type IconName } from '../Icon';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { SeloDeEstado, TOM_DA_LIMPEZA, TOM_DO_PROJETO } from '../SeloDeEstado';

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
const ICONE_ETAPA: Record<string, IconName> = {
  Baixado: 'download',
  Analisado: 'brain',
  Cortes: 'scissors',
  Pós: 'clapperboard',
  Metadados: 'tags',
  Publicado: 'rocket',
};

// D-746: a etapa em curso é ESTADO, não ação — âmbar com filete, nunca a
// tinta do acento, que é dos botões.
const TOM_ETAPA = {
  feito: { bg: 'var(--ok-soft)', cor: 'var(--ok)', filete: 'none' },
  'em-curso': { bg: 'var(--warn-soft)', cor: 'var(--warn)', filete: 'inset 0 0 0 1px var(--warn)' },
  pendente: { bg: 'var(--inset)', cor: 'var(--dim)', filete: 'none' },
};

const HUES = [22, 280, 160, 340, 240, 60, 200, 100];

export function ProjetoCardAp({ projeto, index = 0 }: { projeto: Projeto; index?: number }) {
  const navigate = useNavigate();
  const remover = useRemoverProjeto();
  const limpar = useLimparArquivos();
  const rebaixar = useRebaixarVideo();
  const [thumbErro, setThumbErro] = useState(false);
  const confirmacao = useConfirmacao();

  const estado = estadoDoProjeto(projeto);
  const etapas = construirEtapas(projeto);
  const thumb = thumbnailUrl(projeto.youtube_url, 'mq');
  const hue = HUES[index % HUES.length];
  const baixando = projeto.status === 'baixando';
  const limpo = projeto.arquivos_limpos;
  const nota = Math.round(projeto.pontuacao_ranking);
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
        {/* D-746: moldura em três camadas (passe-partout, bisel, vinheta) —
            a R2 era só respiro + filete, e a arte da live parecia colada. */}
        <MolduraDeVideo
          mat={8}
          proporcao="16/9"
          onClick={abrir}
          rotulo={`Abrir projeto ${projeto.titulo_live} — ${estado.label}`}
        >
          {/* O gradiente mora DENTRO da moldura: live sem miniatura continua
              emoldurada, só troca a arte. */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg,oklch(0.6 0.06 ${hue}),oklch(0.3 0.05 ${hue}))`,
            }}
          />
          {thumb && !thumbErro ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onError={() => setThumbErro(true)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : null}

          <span style={{ position: 'absolute', top: 8, left: 8 }}>
            <SeloDeEstado tom={TOM_DO_PROJETO[estado.key]} sobreArte>
              {estado.label}
              {baixando ? ` ${Math.round(projeto.progresso_download)}%` : ''}
            </SeloDeEstado>
          </span>

          {nota > 0 ? (
            <span
              className="chip gl"
              title={`Nota do projeto no ranking de lives: ${nota}/100`}
              style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--mono)' }}
            >
              <Icon name="trophy" size={11} />
              {nota}
            </span>
          ) : null}

          {projeto.duracao_segundos > 0 ? (
            <span
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: '#fff',
                background: 'rgb(10 14 24 / 0.68)',
                padding: '2px 6px',
                borderRadius: 'var(--r1)',
              }}
            >
              {formatarDuracao(projeto.duracao_segundos)}
            </span>
          ) : null}

          {baixando ? (
            <span
              style={{
                position: 'absolute',
                insetInline: 0,
                bottom: 0,
                height: 3,
                background: 'rgb(0 0 0/.3)',
              }}
              aria-hidden
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, projeto.progresso_download))}%`,
                  background: 'var(--warn)',
                }}
              />
            </span>
          ) : null}
        </MolduraDeVideo>

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
              const tom = TOM_ETAPA[e.estado];
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
                  <Icon name={ICONE_ETAPA[e.label] ?? 'circle-dashed'} size={12} />
                </span>
              );
            })}
          </div>

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
                <Icon name={rebaixando ? 'loader' : 'download'} size={12} />
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
                <Icon name="sparkles" size={12} />
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
              <Icon name="trash" size={12} />
            </button>

            <button
              type="button"
              className="btn btn-icon"
              style={{ width: 24, height: 24 }}
              onClick={abrir}
              title="Abrir a live"
              aria-label="Abrir a live"
            >
              <Icon name="arrow-right" size={12} />
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
