// D-564: vários shorts, nas plataformas escolhidas, cada uma no seu passo.
//
// ## A tela tem dois momentos, e não duas telas
//
// Antes do lote, ela é uma ESCOLHA: quais trechos, quais redes. Depois, é um
// PAINEL: onde cada um está. São o mesmo modal porque são o mesmo assunto — e
// porque o operador que acabou de disparar quer ver o que disparou, não voltar
// para uma lista de caixinhas que ele já marcou.
//
// ## Por que as raias aparecem lado a lado
//
// Porque elas correm de verdade em paralelo (uma tarefa por plataforma no
// backend), e uma lista única mentiria sobre isso: o YouTube terminando
// enquanto o TikTok espera um clique pareceria "travado no item 2".
//
// ## O "publiquei"
//
// No Instagram o upload acontece no celular, longe deste app. `sua_vez` é o
// estado honesto para isso — e o botão que o fecha é o único jeito de o app
// saber. Marcar sozinho seria inventar um fato.
import { useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed, Clock, Hand, Loader2, Send, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { motivoDoErro } from './shortsApi';
import type { EstadoItemLote, ItemDoLote, PublicacaoRegistrada, RaiaDoLote } from './shortsApi';
import {
  alternar,
  contarEnvios,
  contarRepublicacoes,
  montarAlvos,
  plataformasJaPublicadas,
  podeMarcarAMao,
  shortsPublicaveis,
  type ShortDoLote,
} from './selecaoDoLote';
import {
  useCancelarLote,
  useConfirmarPublicacao,
  useCriarLote,
  useLoteAtual,
  usePublicacoesDoCorte,
} from './useLotePublicacao';
import {
  notasDeAgendamento,
  PASSO_EM_SEGUNDOS,
  problemaDoHorario,
  sugestaoDeHorario,
} from './agendamentoDoLote';

// De quanto em quanto tempo o aviso do horário reavalia sozinho. Trinta segundos
// bastam: a margem do backend é de cinco minutos, não de segundos.
const RELOGIO_MS = 30_000;

/**
 * O "agora" que o aviso do horário usa, avançando enquanto `ligado`.
 *
 * Sem ele o aviso só mudaria quando o operador mexesse na data — e o problema
 * que ele existe para pegar é justamente o horário que envelhece parado.
 */
function useAgora(ligado: boolean): [Date, () => void] {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!ligado) return;
    const id = window.setInterval(() => setAgora(new Date()), RELOGIO_MS);
    return () => window.clearInterval(id);
  }, [ligado]);

  return [agora, () => setAgora(new Date())];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** O corte da prateleira. Sem ele (D-611, central de prontos), o histórico vem em `publicacoes`. */
  corteId?: string;
  shorts: ShortDoLote[];
  /** D-611: o que já subiu, quando a tela já sabe — dispensa a consulta por corte. */
  publicacoes?: PublicacaoRegistrada[];
  /** D-611: a seleção com que o modal abre (use `key` para reabrir limpo). */
  selecaoInicial?: string[];
  plataformasIniciais?: string[];
}

// As três que recebem um short VERTICAL. O TikTok horizontal existe no backend
// (D-470), mas ele é do MP4 16:9 do corte — não deste lote, e oferecê-lo aqui
// faria o operador escolher um destino para um arquivo que não é o desta tela.
const PLATAFORMAS = [
  { id: 'youtube_shorts', rotulo: 'YouTube Shorts', nota: 'sobe sozinho, como unlisted' },
  { id: 'tiktok', rotulo: 'TikTok', nota: 'pacote pronto; o upload é seu' },
  { id: 'instagram_reels', rotulo: 'Instagram Reels', nota: 'pacote pronto; sobe do celular' },
] as const;

export function PublicarEmLoteModal({
  open,
  onClose,
  corteId,
  shorts,
  publicacoes: publicacoesConhecidas,
  selecaoInicial,
  plataformasIniciais,
}: Props) {
  const [selecionados, setSelecionados] = useState<string[]>(selecaoInicial ?? []);
  const [plataformas, setPlataformas] = useState<string[]>(
    plataformasIniciais ?? ['youtube_shorts'],
  );
  // D-564 onda 2: como o TikTok sobe. Os dois nascem desligados — o caminho
  // seguro é o padrão, e ligar é uma decisão consciente por lote.
  const [tiktokAssistido, setTiktokAssistido] = useState(false);
  const [instagramAssistido, setInstagramAssistido] = useState(false);
  const [publicarSozinho, setPublicarSozinho] = useState(false);
  // D-580: vazio é "agora", que continua sendo o padrão. A data só nasce quando
  // o operador liga o agendamento — e nasce já dentro da grade de 5 minutos que
  // o TikTok aceita, para ele não descobrir a regra levando erro.
  const [agendarPara, setAgendarPara] = useState('');
  // D-590: nasce desligado pelo mesmo motivo do "publicar sozinho" — subir de
  // novo o que já está no ar cria um segundo vídeo, e isso tem de ser pedido.
  const [republicar, setRepublicar] = useState(false);

  const publicacoes = usePublicacoesDoCorte(corteId ?? '', open && !publicacoesConhecidas);
  const loteAtual = useLoteAtual();
  const criar = useCriarLote();
  const cancelar = useCancelarLote();

  const candidatos = useMemo(() => shortsPublicaveis(shorts), [shorts]);
  const registradas = useMemo(
    () => publicacoesConhecidas ?? publicacoes.data?.publicacoes ?? [],
    [publicacoesConhecidas, publicacoes.data],
  );
  const repetidos = contarRepublicacoes(selecionados, plataformas, registradas);
  // Um interruptor ligado que sumiu da tela (a seleção deixou de ter repetido)
  // não pode continuar valendo às escondidas.
  const vaiRepublicar = repetidos > 0 && republicar;
  const envios = contarEnvios(selecionados, plataformas, registradas, vaiRepublicar);

  const lote = loteAtual.data?.lote ?? null;
  const rodando = Boolean(lote && !lote.terminou);
  // Os interruptores só aparecem quando há TikTok no lote: oferecer opção de
  // uma plataforma que não foi escolhida é ruído com cara de decisão.
  const temTiktok = plataformas.includes('tiktok');
  const temInstagram = plataformas.includes('instagram_reels');
  // O "publicar sozinho" vale para os dois robôs, então basta um deles ligado
  // para a pergunta fazer sentido.
  const temRobo = (temTiktok && tiktokAssistido) || (temInstagram && instagramAssistido);
  const notas = notasDeAgendamento(plataformas, { tiktokAssistido, instagramAssistido });
  const [agora, acertarRelogio] = useAgora(open && Boolean(agendarPara));
  const problemaDoAgendamento = problemaDoHorario(agendarPara, plataformas, agora);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publicar em lote"
      description="Cada plataforma anda no próprio passo — o YouTube não espera o clique do TikTok."
      size="xl"
      footer={
        rodando ? (
          // D-591: o botão precisa DIZER que pegou. O item em curso ainda
          // termina de subir; sem o "cancelando", a espera dele parecia um
          // clique que não fez nada.
          <div className="flex items-center gap-2">
            {cancelar.isError && (
              <span className="text-[11.5px] text-[var(--wb-text-dim)]">
                não consegui cancelar — tente de novo
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={cancelar.isPending || Boolean(lote?.cancelado)}
              title={lote?.cancelado ? 'o item em curso termina; os que esperavam foram cancelados' : undefined}
              onClick={() => cancelar.mutate()}
            >
              {(cancelar.isPending || lote?.cancelado) && <Loader2 className="animate-spin" />}
              {lote?.cancelado ? 'Cancelando…' : 'Cancelar o lote'}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
            <Button
              size="sm"
              disabled={envios === 0 || criar.isPending || Boolean(problemaDoAgendamento)}
              title={problemaDoAgendamento ?? undefined}
              onClick={() =>
                criar.mutate({
                  alvos: montarAlvos(selecionados),
                  plataformas,
                  opcoes: {
                    tiktokAssistido: temTiktok && tiktokAssistido,
                    instagramAssistido: temInstagram && instagramAssistido,
                    // Apertar o botão sozinho só existe DENTRO do assistido: sem
                    // robô no volante não há botão nenhum para apertar.
                    publicarSozinho: temRobo && publicarSozinho,
                    agendarPara,
                    republicar: vaiRepublicar,
                  },
                })
              }
            >
              {criar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Publicar {envios} {envios === 1 ? 'envio' : 'envios'}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {criar.isError && (
          <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-2.5 text-[12px] text-[var(--wb-text-dim)]">
            {motivoDoErro(criar.error, 'não consegui criar o lote')}
          </p>
        )}

        {lote && <PainelDoLote raias={lote.raias} corteId={corteId} />}

        {!rodando && (
          <>
            <Secao titulo="Para onde">
              <div className="flex flex-wrap gap-2">
                {PLATAFORMAS.map((p) => (
                  <Caixa
                    key={p.id}
                    marcada={plataformas.includes(p.id)}
                    onClick={() => setPlataformas((atual) => alternar(atual, p.id))}
                    titulo={p.rotulo}
                    nota={p.nota}
                  />
                ))}
              </div>
              {(temTiktok || temInstagram) && (
                <div className="mt-2 space-y-1.5 rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
                  {/* Um interruptor por plataforma, e não um só: as duas páginas
                      não são nossas e quebram em dias diferentes — desligar o
                      robô de uma não pode desligar o da outra. */}
                  {temTiktok && (
                    <Interruptor
                      ligado={tiktokAssistido}
                      onChange={setTiktokAssistido}
                      titulo="TikTok: o robô sobe pelo Chrome"
                      nota="envia o vídeo, escreve a legenda e põe a capa — e para no Publicar"
                    />
                  )}
                  {temInstagram && (
                    <Interruptor
                      ligado={instagramAssistido}
                      onChange={setInstagramAssistido}
                      titulo="Instagram: o robô sobe pelo Chrome"
                      nota="abre o compositor, envia o vídeo e escreve a legenda — e para no Compartilhar"
                    />
                  )}
                  {temRobo && (
                    <Interruptor
                      ligado={publicarSozinho}
                      onChange={setPublicarSozinho}
                      titulo="…e também aperta o botão final"
                      nota="sem conferência sua: uma legenda errada vira post público no canal"
                      alerta
                    />
                  )}
                </div>
              )}
            </Secao>

            <Secao titulo="Quando">
              <Interruptor
                ligado={Boolean(agendarPara)}
                onChange={(ligado) => {
                  acertarRelogio();
                  setAgendarPara(ligado ? sugestaoDeHorario() : '');
                }}
                titulo="Marcar dia e hora"
                nota="desligado, cada destino publica assim que ficar pronto"
              />
              {Boolean(agendarPara) && (
                <div className="space-y-2 rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
                  <Input
                    type="datetime-local"
                    value={agendarPara}
                    /* `step` põe o seletor do navegador na mesma grade de 5 em 5
                       do TikTok. Não é validação — o backend recusa de todo
                       jeito —, é não deixar o operador escolher 14:03 para
                       depois ouvir que 14:03 não existe. */
                    step={PASSO_EM_SEGUNDOS}
                    onChange={(e) => {
                      acertarRelogio();
                      setAgendarPara(e.target.value);
                    }}
                    className="w-[220px]"
                  />
                  {problemaDoAgendamento && (
                    <p
                      role="alert"
                      className="flex items-start gap-1 text-[11.5px] text-[var(--wb-warn-ink,var(--wb-text-dim))]"
                    >
                      <TriangleAlert className="mt-px size-3.5 shrink-0" />
                      {problemaDoAgendamento}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {notas.map((nota) => (
                      <li
                        key={nota.plataforma}
                        className="flex gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]"
                      >
                        <span
                          className={
                            nota.como === 'sozinho'
                              ? 'text-[var(--wb-accent)]'
                              : 'text-[var(--wb-text-mute)]'
                          }
                        >
                          {nota.como === 'sozinho' ? '●' : '○'}
                        </span>
                        <span>
                          <b className="font-medium text-[var(--wb-text)]">{nota.plataforma}</b> —{' '}
                          {nota.texto}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Secao>

            <Secao
              titulo="Quais trechos"
              acao={
                candidatos.length > 0 && (
                  <button
                    type="button"
                    className="text-[11.5px] text-[var(--wb-accent)]"
                    onClick={() =>
                      setSelecionados((atual) =>
                        atual.length === candidatos.length ? [] : candidatos.map((c) => c.id),
                      )
                    }
                  >
                    {selecionados.length === candidatos.length ? 'limpar' : 'todos'}
                  </button>
                )
              }
            >
              {candidatos.length === 0 ? (
                <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-3 text-[12px] text-[var(--wb-text-mute)]">
                  Nenhum short renderizado ainda. O lote parte do MP4 final.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {candidatos.map((short) => (
                    <LinhaDoShort
                      key={short.id}
                      short={short}
                      marcado={selecionados.includes(short.id)}
                      jaPublicado={plataformasJaPublicadas(registradas, short.id)}
                      onClick={() => setSelecionados((atual) => alternar(atual, short.id))}
                    />
                  ))}
                </ul>
              )}
              {/* D-590: só aparece quando a seleção tem algo já no ar — é a
                  única hora em que a pergunta tem assunto. Vale para as três
                  plataformas: "já subiu" não quer dizer "subiu certo". */}
              {repetidos > 0 && (
                <div className="rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
                  <Interruptor
                    ligado={republicar}
                    onChange={setRepublicar}
                    titulo={`Republicar ${repetidos} ${repetidos === 1 ? 'envio que já foi' : 'envios que já foram'}`}
                    nota="sobe um vídeo novo; o antigo continua no ar até você apagar na plataforma"
                    alerta
                  />
                </div>
              )}
            </Secao>
          </>
        )}
      </div>
    </Modal>
  );
}

function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--wb-text-mute)]">
          {titulo}
        </h3>
        <div className="flex-1" />
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Um interruptor de decisão, com o que ele muda escrito embaixo.
 *
 * A nota não é enfeite: "o robô sobe pelo Chrome" e "o robô publica" parecem a
 * mesma frase e são responsabilidades opostas. Quem lê às onze da noite precisa
 * da consequência à vista, não do nome da opção.
 */
function Interruptor({
  ligado,
  onChange,
  titulo,
  nota,
  alerta = false,
}: {
  ligado: boolean;
  onChange: (valor: boolean) => void;
  titulo: string;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={ligado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 flex-none accent-[var(--wb-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold">{titulo}</span>
        <span
          className={cn(
            'block text-[11px]',
            alerta && ligado
              ? 'text-[var(--wb-warn-ink,var(--wb-text-dim))]'
              : 'text-[var(--wb-text-mute)]',
          )}
        >
          {nota}
        </span>
      </span>
    </label>
  );
}

function Caixa({
  marcada,
  onClick,
  titulo,
  nota,
}: {
  marcada: boolean;
  onClick: () => void;
  titulo: string;
  nota: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcada}
      aria-label={titulo}
      className={cn(
        'flex min-w-[180px] flex-1 flex-col items-start gap-0.5 rounded-[9px] border px-3 py-2 text-left transition-colors',
        marcada
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-inset)]',
      )}
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
        {marcada && <Check size={12} aria-hidden />}
        {titulo}
      </span>
      <span className="text-[11px] text-[var(--wb-text-mute)]">{nota}</span>
    </button>
  );
}

function LinhaDoShort({
  short,
  marcado,
  jaPublicado,
  onClick,
}: {
  short: ShortDoLote;
  marcado: boolean;
  jaPublicado: Set<string>;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={marcado}
        aria-label={short.titulo || `Trecho ${short.numero}`}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left transition-colors',
          marcado
            ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
            : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-inset)]',
        )}
      >
        <span
          className={cn(
            'flex size-4 flex-none items-center justify-center rounded-[4px] border',
            marcado
              ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-white'
              : 'border-[var(--wb-border)]',
          )}
        >
          {marcado && <Check size={11} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px]">
          {short.titulo || `Trecho ${short.numero}`}
          {short.origem && (
            <span className="ml-1.5 text-[11px] text-[var(--wb-text-mute)]">· {short.origem}</span>
          )}
        </span>
        <span className="flex-none font-code text-[11px] text-[var(--wb-text-mute)]">
          {Math.round(short.duracao_seg)}s
        </span>
        {/* Já publicado é INFORMAÇÃO, não filtro: o item continua na lista e o
            lote o pula sozinho. Sumir da vista viraria dúvida. */}
        {[...jaPublicado].map((plataforma) => (
          <span
            key={plataforma}
            className="flex-none rounded-[5px] bg-[var(--wb-bg-inset)] px-1.5 py-0.5 text-[10.5px] text-[var(--wb-text-mute)]"
          >
            já em {rotuloCurto(plataforma)}
          </span>
        ))}
      </button>
    </li>
  );
}

function PainelDoLote({ raias, corteId }: { raias: RaiaDoLote[]; corteId?: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {raias.map((raia) => (
        <article
          key={raia.plataforma}
          className="rounded-[9px] border border-[var(--wb-border)] p-2.5"
        >
          <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold">
            {raia.rotulo}
            {raia.exige_humano && (
              <Hand size={11} className="text-[var(--wb-text-mute)]" aria-label="depende de você" />
            )}
          </h4>
          {raia.aviso && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
              <TriangleAlert size={11} className="mt-0.5 flex-none" aria-hidden />
              {raia.aviso}
            </p>
          )}
          <ul className="mt-1.5 space-y-1">
            {raia.itens.map((item) => (
              <ItemDaRaia key={`${item.alvo_id}-${item.plataforma}`} item={item} corteId={corteId} />
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function ItemDaRaia({ item, corteId }: { item: ItemDoLote; corteId?: string }) {
  const confirmar = useConfirmarPublicacao(corteId);

  return (
    <li className="rounded-[6px] bg-[var(--wb-bg-inset)] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icone estado={item.estado} />
        <span className="min-w-0 flex-1 truncate text-[11.5px]" title={item.rotulo}>
          {item.rotulo}
        </span>
        {/* D-603: tambem no item que falhou. O caso comum e o robo quebrar no
            meio e ele terminar no app da rede — e sem este botao o short ficava
            para sempre como "nao publicado", pedindo para subir de novo. */}
        {podeMarcarAMao(item.estado) && (
          <button
            type="button"
            className="flex-none text-[11px] font-semibold text-[var(--wb-accent)]"
            disabled={confirmar.isPending}
            title={
              item.estado === 'sua_vez'
                ? 'marcar que voce publicou'
                : 'ja publiquei este na mao, fora do app'
            }
            onClick={() => confirmar.mutate({ alvoId: item.alvo_id, plataforma: item.plataforma })}
          >
            {item.estado === 'sua_vez' ? 'publiquei' : 'ja publiquei'}
          </button>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex-none text-[11px] text-[var(--wb-accent)]"
          >
            ver
          </a>
        )}
      </div>
      {item.detalhe && (
        <p className="mt-0.5 truncate text-[10.5px] text-[var(--wb-text-mute)]" title={item.detalhe}>
          {item.detalhe}
        </p>
      )}
    </li>
  );
}

function Icone({ estado }: { estado: EstadoItemLote }) {
  if (estado === 'preparando') {
    return <Loader2 size={12} className="flex-none animate-spin text-[var(--wb-accent)]" />;
  }
  if (estado === 'publicado') {
    return <Check size={12} className="flex-none text-[var(--wb-ok-ink,var(--wb-accent))]" />;
  }
  if (estado === 'sua_vez') {
    return <Hand size={12} className="flex-none text-[var(--wb-accent)]" />;
  }
  if (estado === 'erro') {
    return <TriangleAlert size={12} className="flex-none text-[var(--wb-text-dim)]" />;
  }
  if (estado === 'aguardando') {
    return <Clock size={12} className="flex-none text-[var(--wb-text-mute)]" />;
  }
  return <CircleDashed size={12} className="flex-none text-[var(--wb-text-mute)]" />;
}

function rotuloCurto(plataforma: string): string {
  return PLATAFORMAS.find((p) => p.id === plataforma)?.rotulo ?? plataforma;
}
