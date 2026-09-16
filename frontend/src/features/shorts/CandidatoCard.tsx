import {
  Check,
  Clapperboard,
  Eye,
  Image as ImageIcon,
  MoveHorizontal,
  Play,
  Plus,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { APARENCIA, notaVisivel, planoDeAcoes, tomDaNota, type AcaoId } from './estadoDoCandidato';
import type { PalcoShortPreset } from '@/types/presets';
import { LinhaDeAjuste } from './LinhaDeAjuste';
import { ListaDeSegmentos } from './ListaDeSegmentos';
import { efetivos, temColagem, type Segmento } from './segmentosDoShort';
import { PainelPublicacao } from './PainelPublicacao';
import { ProgressoRenderPanel } from './ProgressoRenderPanel';
import { shortVideoUrl, type ShortSugerido, type StatusShort } from './shortsApi';
import {
  useCapaDoShort,
  useGanchoPadrao,
  usePalcoPadrao,
  useProgressoRender,
} from './useShortsDoCorte';
import { useFechoDoShort } from './useFechoDoShort';

// D-492: o card de um candidato, reorganizado.
//
// Antes: oito botões de peso visual idêntico, todos disponíveis o tempo todo,
// num `BotaoAcao` caseiro que ignorava o kit do projeto. O resultado é o que o
// operador descreveu — "um monte de botão sem organização".
//
// Agora a leitura desce em quatro degraus, e cada um responde uma pergunta:
//
//   IDENTIDADE  o que é este trecho, e quanto vale       (nota, título, gancho)
//   DECISÃO     em que pé está                           (chip de status)
//   AJUSTE      como ele vai ficar                       (recolhido)
//   PRODUÇÃO    o que fazer agora                        (UMA ação em destaque)
//
// O ajuste nasce recolhido de propósito: enquadramento e arranjo são refinos, e
// refino que fica aberto em cinco cards ao mesmo tempo vira parede de controle.

interface Props {
  short: ShortSugerido;
  corteId: string;
  emFoco: boolean;
  ocupado: boolean;
  aberto: boolean;
  onAlternarAjuste: () => void;
  onSelecionar: () => void;
  onTocar: () => void;
  onStatus: (status: StatusShort) => void;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onEnquadrarPeloRosto: () => void;
  enquadrando: boolean;
  vereditoDoRosto: string;
  onPalco: (presetId: string, payload: PalcoShortPreset | null) => void;
  onSeguirPadrao: () => void;
  /** D-542: abre o modal do palco já neste candidato. */
  onDefinirPalco: () => void;
  /** D-565: abre o modal do gancho já neste candidato. */
  onEscreverGancho: () => void;
  onPrevia: () => void;
  onRenderizar: () => void;
  /** D-604: grava a colagem deste short. `[]` desfaz e volta à janela única. */
  onSegmentos: (segmentos: Segmento[]) => void;
  /** Onde o player está, na timeline do bruto — de onde nasce o pedaço novo. */
  tempoAtualSeg: number;
  /** A duração do bruto, para o pedaço novo não passar do fim. */
  duracaoBrutoSeg: number;
  /** Leva o player até um instante do bruto. */
  onIr: (segundos: number) => void;
}

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function CandidatoCard({
  short,
  corteId,
  emFoco,
  ocupado,
  aberto,
  onAlternarAjuste,
  onSelecionar,
  onTocar,
  onStatus,
  onBorda,
  onEnquadrarPeloRosto,
  enquadrando,
  vereditoDoRosto,
  onPalco,
  onSeguirPadrao,
  onDefinirPalco,
  onEscreverGancho,
  onPrevia,
  onRenderizar,
  onSegmentos,
  tempoAtualSeg,
  duracaoBrutoSeg,
  onIr,
}: Props) {
  // Os padrões do corte, lidos do cache que o menu de padrões já carregou: o
  // card mostra o que o trecho HERDA, e não só o que ele gravou.
  const palcoPadrao = usePalcoPadrao(corteId);
  const ganchoPadrao = useGanchoPadrao(corteId);
  const corDoGancho = short.gancho_cor || ganchoPadrao.data?.payload.cor || '';
  // O hook mora AQUI, e nao no pai: e um por candidato, e um laco no pai nao
  // pode chamar hooks. Consulta uma vez ao montar e so entra em polling se
  // achar algo rodando.
  const progresso = useProgressoRender(
    short.id,
    corteId,
    short.status === 'aprovado' || short.status === 'renderizado',
  );
  const renderizando = progresso !== null && !progresso.concluido;
  // D-585: o fecho do short. A capa só entra quando há MP4 em disco — ela é um
  // QUADRO do vídeo, e sem arquivo o modal só saberia dizer "ainda não dá".
  const temArquivo = short.status === 'renderizado' && Boolean(short.arquivo_short_path);
  const fecho = useFechoDoShort(short);
  const capa = useCapaDoShort(short.id, temArquivo);
  const plano = planoDeAcoes(short, renderizando);
  const aparencia = APARENCIA[short.status];

  const acoes: Record<AcaoId, { rotulo: string; icone: React.ReactNode; ao: () => void }> = {
    aprovar: { rotulo: 'Aprovar', icone: <Check />, ao: () => onStatus('aprovado') },
    rejeitar: { rotulo: 'Rejeitar', icone: <X />, ao: () => onStatus('rejeitado') },
    voltar: { rotulo: 'Voltar para sugerido', icone: <Undo2 />, ao: () => onStatus('sugerido') },
    previa: { rotulo: 'Gerar prévia', icone: <Eye />, ao: onPrevia },
    refazerPrevia: { rotulo: 'Refazer prévia', icone: <Eye />, ao: onPrevia },
    // D-585: finalizar dispara o render E a IA escreve o post, sem modal. O
    // texto não depende do arquivo, então esses minutos de render são
    // justamente o tempo em que ele se escreve — revisar fica no painel.
    finalizar: {
      rotulo: 'Finalizar',
      icone: <Clapperboard />,
      ao: () => fecho.finalizar(onRenderizar),
    },
    // Refazer NÃO mexe no post: o texto já existe, e o que se está refazendo é
    // o arquivo.
    refazerFinal: { rotulo: 'Refazer o final', icone: <Clapperboard />, ao: onRenderizar },
  };

  // D-495: rejeitado COLAPSA. Ele ja foi decidido — manter o card inteiro
  // ocupando a coluna faz o operador rolar por cima do que descartou para
  // chegar no que interessa. Uma linha basta para lembrar que existe e permitir
  // voltar atras.
  if (short.status === 'rejeitado') {
    return (
      <article
        onClick={onSelecionar}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 opacity-70 transition-opacity hover:opacity-100',
          emFoco ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
          'bg-[var(--wb-bg-inset)]',
        )}
      >
        <span className="font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]">
          {notaVisivel(short)}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-[var(--wb-text-dim)] line-through"
          title={short.titulo}
        >
          {short.titulo}
        </span>
        <span className="flex-none font-code text-[10px] tabular-nums text-[var(--wb-text-mute)]">
          {mmss(short.inicio_seg)} · {Math.round(short.duracao_seg)}s
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onStatus('sugerido');
          }}
        >
          <Undo2 />
          Voltar
        </Button>
      </article>
    );
  }

  return (
    <article
      onClick={onSelecionar}
      onFocusCapture={onSelecionar}
      className={cn(
        'cursor-pointer rounded-[12px] border bg-[var(--wb-bg-card)] transition-shadow',
        emFoco
          ? 'border-[var(--wb-accent)] shadow-[var(--wb-shadow)]'
          : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      {/* ── Identidade ─────────────────────────────────────────────── */}
      <header className="flex items-start gap-2.5 p-3 pb-2">
        <span
          title={short.origem === 'manual' ? 'Trecho seu — sem nota da IA' : 'Nota da IA'}
          className={cn(
            'grid h-9 w-9 flex-none place-items-center rounded-[9px] font-code text-[14px] font-bold tabular-nums',
            tomDaNota(short) === 'success' && 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]',
            tomDaNota(short) === 'accent' && 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong)]',
            tomDaNota(short) === 'neutral' && 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
          )}
        >
          {notaVisivel(short)}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-bold leading-tight" title={short.titulo}>
            {short.titulo}
          </h3>
          {short.gancho && (
            <p className="mt-0.5 line-clamp-2 text-[12px] italic leading-snug text-[var(--wb-text-dim)]">
              “{short.gancho}”
            </p>
          )}
          {/* D-565: o gancho de ABERTURA — o que vai virar pixel nos primeiros
              segundos. Fica na identidade, e nao no bloco de ajuste, porque e
              CONTEUDO: decide o que o short promete, nao como ele fica.

              Uma linha so, que abre o modal. Um campo de texto aqui reabriria a
              parede de controles que a D-492 desfez — em cinco cards ao mesmo
              tempo. */}
          <button
            type="button"
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              onEscreverGancho();
            }}
            title="Escrever o gancho que aparece nos primeiros segundos"
            // D-568: vazio, precisa PARECER um botão.
            //
            // A D-565 acertou em deixar uma linha só — um campo de texto aqui
            // reabriria a parede de controles que a D-492 desfez, em cinco
            // cards ao mesmo tempo. Mas "sem gancho na abertura" em cinza, sem
            // borda, lia-se como uma etiqueta descrevendo um fato, e não como
            // um lugar onde clicar: "não aparece em nenhum lugar a opção".
            //
            // Preenchido ele volta a ser texto, que é o certo — ali o conteúdo
            // é o assunto, e a moldura seria ruído sobre algo já resolvido.
            className={cn(
              'mt-1 flex w-full items-center gap-1 rounded-[6px] px-1 py-0.5 text-left text-[11.5px] leading-snug transition-colors hover:bg-[var(--wb-bg-inset)] disabled:opacity-45',
              short.gancho_tela
                ? 'text-[var(--wb-text)]'
                : 'border border-dashed border-[var(--wb-border)] text-[var(--wb-text-mute)] hover:border-[var(--wb-accent)] hover:text-[var(--wb-text)]',
            )}
          >
            {short.gancho_tela ? (
              // D-581: a AMOSTRA da cor no lugar do ícone genérico.
              //
              // A cor do gancho existe para ele não se confundir com a legenda
              // — e escondê-la atrás de um modal deixaria o operador sem saber,
              // varrendo cinco cards, qual trecho já ganhou cor e qual ainda
              // sai branco. O ponto responde isso sem ele abrir nada.
              <span
                aria-hidden
                title={
                  corDoGancho
                    ? `Gancho em ${corDoGancho}${short.gancho_cor ? '' : ' (do padrão do corte)'}`
                    : 'Gancho em branco (o padrão)'
                }
                className="h-2.5 w-2.5 flex-none rounded-full border border-[var(--wb-border)]"
                // A cor HERDADA: lida só do trecho, o ponto ficava branco em
                // todo card que segue o gancho padrão — e trocar o padrão
                // parecia não mudar nada.
                style={{ backgroundColor: corDoGancho || '#ffffff' }}
              />
            ) : (
              <Plus size={11} className="flex-none opacity-70" aria-hidden />
            )}
            <span className="truncate">
              {short.gancho_tela || 'escrever o gancho da abertura'}
            </span>
          </button>
        </div>

        <div className="flex flex-none flex-col items-end gap-1">
          <StatusChip label={aparencia.rotulo} tone={aparencia.tom} />
          {short.origem === 'manual' && (
            <span
              className="font-code text-[9.5px] uppercase tracking-wide text-[var(--wb-text-mute)]"
              title="Marcado por você — a regeração não apaga"
            >
              seu
            </span>
          )}
        </div>
      </header>

      {/* ── Números que decidem, numa linha só ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span className="font-semibold text-[var(--wb-text-dim)]">
          {mmss(short.inicio_seg)} → {mmss(short.fim_seg)}
        </span>
        {/* D-604: a duração é a LÍQUIDA, que o backend já manda somada. Num short
            colado ela é MENOR que o span ao lado, e é isso que o operador precisa
            ver — o limite do Shorts é sobre o vídeo, não sobre o envelope. */}
        <span>{Math.round(short.duracao_seg)}s</span>
        {temColagem(short) && (
          <span
            className="rounded-[5px] bg-[var(--wb-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--wb-accent-strong)]"
            title="Este short é montado por segmentos separados do bruto. O que fica entre eles não entra."
          >
            {efetivos(short).length} segmentos
          </span>
        )}
        {/* D-558: o "50%" do enquadramento saiu daqui junto com o controle.
            Ele mostrava onde a janela 9:16 se centra no quadro cru — número que
            só age quando o trecho NÃO tem palco, e que num trecho com palco
            ficava na linha dos que decidem sem decidir nada. */}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAlternarAjuste();
          }}
        >
          <MoveHorizontal />
          {aberto ? 'ocultar ajustes' : 'ajustar'}
        </Button>
      </div>

      {short.justificativa && !aberto && (
        <p className="px-3 pb-2 text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          {short.justificativa}
        </p>
      )}

      {/* ── Ajuste: recolhido, porque é refino ─────────────────────── */}
      {aberto && (
        <LinhaDeAjuste
          short={short}
          ocupado={ocupado}
          onBorda={onBorda}
          onEnquadrarPeloRosto={onEnquadrarPeloRosto}
          enquadrando={enquadrando}
          vereditoDoRosto={vereditoDoRosto}
          onPalco={onPalco}
          onSeguirPadrao={onSeguirPadrao}
          nomeDoPadrao={palcoPadrao.data?.nome ?? ''}
          onDefinirPalco={onDefinirPalco}
        />
      )}

      {/* D-604: os pedaços ficam DENTRO do ajuste, e não no corpo do card.
          São a decisão mais fina do trecho — mexer nela é refino, do mesmo nível
          das bordas —, e oito cards mostrando listas de pedaços reconstruiriam a
          parede de controles que a D-492 desmontou. */}
      {aberto && (
        <div className="border-t border-[var(--wb-border-soft)] px-3 py-2">
          <ListaDeSegmentos
            short={short}
            tempoAtualSeg={tempoAtualSeg}
            duracaoBrutoSeg={duracaoBrutoSeg}
            ocupado={ocupado}
            onGravar={onSegmentos}
            onIr={onIr}
          />
        </div>
      )}

      {/* ── Produção: uma ação em destaque ─────────────────────────── */}
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-[var(--wb-border-soft)] p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onTocar();
          }}
        >
          <Play />
          Assistir
        </Button>

        <div className="flex-1" />

        {plano.secundarias.map((id) => (
          <Button
            key={id}
            variant="secondary"
            size="sm"
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              acoes[id].ao();
            }}
          >
            {acoes[id].icone}
            {acoes[id].rotulo}
          </Button>
        ))}

        {plano.principal && (
          <Button
            size="sm"
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              acoes[plano.principal as AcaoId].ao();
            }}
          >
            {acoes[plano.principal].icone}
            {acoes[plano.principal].rotulo}
          </Button>
        )}

        {plano.noMenu.length > 0 && (
          <OverflowMenu
            label="Mais ações deste candidato"
            align="right"
            compact
            items={plano.noMenu.map((id) => ({
              label: acoes[id].rotulo,
              onClick: acoes[id].ao,
              danger: id === 'rejeitar',
            }))}
          />
        )}
      </footer>

      {progresso && <ProgressoRenderPanel progresso={progresso} shortId={short.id} />}

      {short.arquivo_previa_path && short.status !== 'renderizado' && !renderizando && (
        <PlayerDoArquivo
          titulo="prévia · sem filtro"
          src={shortVideoUrl(short.id, 'previa')}
          nota="O filtro entra só no finalizar, junto com o recorte — se viesse depois, mexeria na cor da legenda."
        />
      )}

      {short.status === 'renderizado' && (
        <PlayerDoArquivo
          titulo="final · pronto para publicar"
          src={shortVideoUrl(short.id, 'final')}
        />
      )}

      {short.status === 'renderizado' && (
        <PainelPublicacao
          short={short}
          corteId={corteId}
          onEscreverPost={fecho.abrirPost}
          onEscolherCapa={fecho.abrirCapa}
        />
      )}

      {/* D-585: a capa que ficou para trás.
          Quando o render termina DEPOIS de o operador fechar o post, a corrente
          se quebra — e sem isto a pendência ficaria só na memória dele. A linha
          some sozinha assim que a capa existe. */}
      {temArquivo && capa.data && !capa.data.tem_capa && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fecho.abrirCapa();
          }}
          className="flex w-full items-center gap-1.5 border-t border-[var(--wb-border-soft)] px-3 py-2 text-left text-[11.5px] text-[var(--wb-warn-ink)] transition-colors hover:bg-[var(--wb-bg-inset)]"
        >
          <ImageIcon size={12} className="flex-none" aria-hidden />
          Falta escolher a capa — sem ela a plataforma pega um quadro qualquer.
        </button>
      )}

      {fecho.modais}
    </article>
  );
}

/** O MP4 do short, no formato em que ele vai sair. */
function PlayerDoArquivo({
  titulo,
  src,
  nota,
}: {
  titulo: string;
  src: string;
  nota?: string;
}) {
  return (
    <div className="border-t border-[var(--wb-border-soft)] p-3">
      <p className="mb-1.5 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        {titulo}
      </p>
      <video
        src={src}
        controls
        preload="metadata"
        className="mx-auto max-h-[300px] w-auto rounded-[9px] bg-black"
      />
      {nota && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">{nota}</p>
      )}
    </div>
  );
}
