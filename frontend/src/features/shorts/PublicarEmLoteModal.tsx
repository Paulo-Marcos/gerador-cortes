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
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { motivoDoErro } from './shortsApi';
import type { PublicacaoRegistrada } from './shortsApi';
import { PainelDoLote } from './PainelDoLote';
import { paraEnvio, problemasDasLinhas, resumoDaAgenda, type ModoDeQuando } from './agendaDoLote';
import { Caixa, Interruptor, PLATAFORMAS, rotuloCurto, Secao } from './pecasDoLote';
import { QuandoDoLote } from './QuandoDoLote';
import { useAgendaDoLote } from './useAgendaDoLote';
import {
  alternar,
  contarEnvios,
  contarRepublicacoes,
  montarAlvos,
  plataformasJaPublicadas,
  shortsPublicaveis,
  type ShortDoLote,
} from './selecaoDoLote';
import {
  useCancelarLote,
  useCriarLote,
  useLoteAtual,
  usePublicacoesDoCorte,
} from './useLotePublicacao';
import { notasDeAgendamento, problemaDoHorario, sugestaoDeHorario } from './agendamentoDoLote';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { pedirGavetaDaFila } from '@/upgrade/useGavetaDaFila';

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
  // D-580/D-908: "agora" continua sendo o padrão. A data única só nasce quando
  // o operador a escolhe — já na grade de 5 minutos do TikTok —, e a agenda
  // distribuída só é calculada quando ele escolhe distribuir.
  const [modo, setModo] = useState<ModoDeQuando>('agora');
  const [agendarPara, setAgendarPara] = useState('');
  // D-590: nasce desligado pelo mesmo motivo do "publicar sozinho" — subir de
  // novo o que já está no ar cria um segundo vídeo, e isso tem de ser pedido.
  const [republicar, setRepublicar] = useState(false);

  const publicacoes = usePublicacoesDoCorte(corteId ?? '', open && !publicacoesConhecidas);
  const loteAtual = useLoteAtual();
  const criar = useCriarLote();

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
  const [agora, acertarRelogio] = useAgora(open && modo !== 'agora');
  // D-897: disparado, o lote se acompanha na gaveta da fila, que sobrevive à troca de projeto.
  const acompanharNaFila = () => {
    onClose();
    pedirGavetaDaFila();
  };
  const problemaDoAgendamento =
    modo === 'uma_data' ? problemaDoHorario(agendarPara, plataformas, agora) : null;
  // D-908: a agenda distribuída, calculada antes do clique e ajustável linha a linha.
  const alvos = useMemo(() => montarAlvos(selecionados), [selecionados]);
  const agenda = useAgendaDoLote(alvos, plataformas, open && modo === 'distribuir');
  const problemasDaAgenda = useMemo(
    () => problemasDasLinhas(agenda.linhas, agora),
    [agenda.linhas, agora],
  );
  const resumo = resumoDaAgenda(agenda.linhas);
  // Sem linha com data (ou no ato) não há o que publicar; com linha com problema, não ainda.
  const agendaPronta =
    modo !== 'distribuir' ||
    (!agenda.carregando && problemasDaAgenda.size === 0 && resumo.comData + resumo.noAto > 0);
  const trocarModo = (novo: ModoDeQuando) => {
    acertarRelogio();
    setModo(novo);
    setAgendarPara(novo === 'uma_data' ? sugestaoDeHorario() : '');
  };
  const rotuloDoAlvo = (alvoId: string) => {
    const short = candidatos.find((c) => c.id === alvoId);
    return short ? short.titulo || `Trecho ${short.numero}` : alvoId.slice(0, 8);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publicar em lote"
      description="Cada plataforma anda no próprio passo — o YouTube não espera o clique do TikTok."
      size="xl"
      footer={
        rodando ? (
          <RodapeDoLoteEmCurso cancelado={Boolean(lote?.cancelado)} />
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
            <Button
              size="sm"
              disabled={
                envios === 0 || criar.isPending || Boolean(problemaDoAgendamento) || !agendaPronta
              }
              title={problemaDoAgendamento ?? undefined}
              onClick={() =>
                criar.mutate({
                  alvos,
                  plataformas,
                  opcoes: {
                    tiktokAssistido: temTiktok && tiktokAssistido,
                    instagramAssistido: temInstagram && instagramAssistido,
                    // Apertar o botão sozinho só existe DENTRO do assistido: sem
                    // robô no volante não há botão nenhum para apertar.
                    publicarSozinho: temRobo && publicarSozinho,
                    agendarPara: modo === 'uma_data' ? agendarPara : '',
                    republicar: vaiRepublicar,
                    agenda: modo === 'distribuir' ? paraEnvio(agenda.linhas) : undefined,
                  },
                }, { onSuccess: acompanharNaFila })
              }
            >
              {criar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={ICONE_DO_CONCEITO.publicar} />}
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
                      titulo="TikTok: o robô sobe pelo navegador"
                      nota="envia o vídeo, escreve a legenda e põe a capa — e para no Publicar"
                    />
                  )}
                  {temInstagram && (
                    <Interruptor
                      ligado={instagramAssistido}
                      onChange={setInstagramAssistido}
                      titulo="Instagram: o robô sobe pelo navegador"
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

            <QuandoDoLote
              modo={modo}
              onModo={trocarModo}
              agendarPara={agendarPara}
              onAgendarPara={(valor) => {
                acertarRelogio();
                setAgendarPara(valor);
              }}
              problemaDoAgendamento={problemaDoAgendamento}
              notas={notas}
              linhas={agenda.linhas}
              carregandoAgenda={agenda.carregando}
              erroDaAgenda={agenda.erro}
              problemasDasLinhas={problemasDaAgenda}
              onAjustarLinha={(chave, valor) => {
                acertarRelogio();
                agenda.ajustar(chave, valor);
              }}
              onRecalcular={agenda.recalcular}
              rotuloDoAlvo={rotuloDoAlvo}
            />

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
              ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
              : 'border-[var(--wb-border)]',
          )}
        >
          {marcado && <Icon name="check" />}
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

/**
 * D-591: o botão precisa DIZER que pegou. O item em curso ainda termina de
 * subir; sem o "cancelando", a espera dele parecia um clique que não fez nada.
 */
function RodapeDoLoteEmCurso({ cancelado }: { cancelado: boolean }) {
  const cancelar = useCancelarLote();
  return (
    <div className="flex items-center gap-2">
      {cancelar.isError && (
        <span className="text-[11.5px] text-[var(--wb-text-dim)]">
          não consegui cancelar — tente de novo
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={cancelar.isPending || cancelado}
        title={cancelado ? 'o item em curso termina; os que esperavam foram cancelados' : undefined}
        onClick={() => cancelar.mutate()}
      >
        {(cancelar.isPending || cancelado) && <Icon name="loader-2" className="animate-spin" />}
        {cancelado ? 'Cancelando…' : 'Cancelar o lote'}
      </Button>
    </div>
  );
}
