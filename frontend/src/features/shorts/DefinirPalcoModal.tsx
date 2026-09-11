import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Maximize2,
  Minimize2,
  Move,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  useDeleteLayoutPreset,
  useLayoutPresets,
  useSaveLayoutPreset,
  useUpdateLayoutPreset,
} from '@/features/editor/fase2/useLayoutPresets';
import type { PalcoShortPreset } from '@/types/presets';
import { EditorDeRecorte } from './EditorDeRecorte';
import { CamposDoPalco, EditorDePalco } from './EditorDePalco';
import { CORES_DA_LEGENDA, LegendaPrevia } from './LegendaPrevia';
import { useTranscricaoDoCorte } from './useShortsDoCorte';
import { useSimulacaoDePalco } from './useSimulacaoDePalco';
import { ocupacaoDoPalco, redimensionarPalco } from './arrastarSlot';
import { PalcoPrevia } from './PalcoPrevia';
import { SeletorDeTextura } from './SeletorDeTextura';
import { mudancaDoPalco } from './aplicarPalco';
import { usePalcoDoCorte } from './useShortsDoCorte';
import { useArranjosDePalco } from './useShortsDoCorte';
import type { AtualizarShortBody, PlanoDesenhavel, Retangulo, ShortSugerido } from './shortsApi';

// D-509: um lugar só para montar a tela do short.
//
// "Hoje me parece tudo muito embolado." Estava: bordas, enquadramento, recortes,
// moldura e arranjo dividiam a mesma fileira de controles, com pesos iguais e
// sem dizer quais dependiam de quais. Cinco perguntas soltas onde havia uma:
// COMO ESTA TELA É MONTADA.
//
// Aqui elas viram uma sequência, na ordem em que se decide:
//
//   1. como monta   — tela cheia ou dividida (o full/compartilhada do horizontal)
//   2. de onde vem  — o recorte de cada janela sobre o quadro da live
//   3. o fundo      — a cor por trás, da paleta do canal
//   4. preset       — guardar isso com um nome, para o próximo trecho
//
// E a prévia fica ao lado o tempo inteiro: decidir olhando para o resultado é o
// que dispensa entender a mecânica.

// 5% por clique. Menos que isso não se vê na prévia e o operador clica dez
// vezes achando que travou; mais que isso pula o tamanho que ele queria.
const PASSO_DO_TAMANHO = 1.05;

const REGIAO: Record<string, string> = {
  pessoa: 'a pessoa',
  tela: 'a tela compartilhada',
  quadro: 'o quadro da live',
};

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortSugerido;
  corteId: string;
  /** O plano resolvido — a prévia e os recortes atuais saem dele. */
  plano: PlanoDesenhavel | null;
  /** A resolução medida do bruto, para o editor de recorte. */
  fonte: { largura: number; altura: number };
  /** O player do bruto: a prévia desenha os quadros dele. */
  video: React.RefObject<HTMLVideoElement | null>;
  ocupado: boolean;
  /** D-563: onde o player parou — a legenda da prévia desenha ESTE instante. */
  tempoAtualSeg: number;
  onAplicar: (mudanca: AtualizarShortBody) => void;
}

export function DefinirPalcoModal({
  open,
  onClose,
  short,
  corteId,
  plano,
  fonte,
  video,
  ocupado,
  tempoAtualSeg,
  onAplicar,
}: Props) {
  const arranjos = useArranjosDePalco(corteId);
  const presets = useLayoutPresets({ tipo: 'palco_short' });
  const salvar = useSaveLayoutPreset();
  const renomear = useUpdateLayoutPreset();
  // D-561: instância separada da do rename de propósito. As duas chamam o mesmo
  // endpoint, e compartilhá-las faria o aviso de "regravado" piscar também ao
  // renomear — um retorno que mentiria sobre o que acabou de acontecer.
  const regravar = useUpdateLayoutPreset();
  const apagar = useDeleteLayoutPreset();

  // D-562: mover as janelas dentro do quadro, aqui dentro.
  //
  // O gesto existia na página, sobre a prévia pequena ao lado do player, e o
  // operador gostou dele. O lugar é que era errado: mover uma janela é a mesma
  // decisão que dimensioná-la, e dimensionar já mora na seção 3 daqui. Ter as
  // duas metades em telas diferentes obrigava a sair do modal no meio da
  // decisão — e a prévia da página não é fixa.
  const [movendo, setMovendo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  const recortesDaFonte: Record<string, Retangulo> = Object.fromEntries(
    (plano?.recortes ?? []).map((r) => [r.regiao, r.origem]),
  );
  const regioesEmJogo = Object.keys(plano?.slots ?? {});

  /**
   * O palco deste short, no formato que o preset guarda.
   *
   * D-561: dois campos estavam errados aqui, e os dois só apareciam DEPOIS,
   * quando o preset era aplicado noutro trecho.
   *
   * `fundo` gravava `fundo_palco` — a chave de COR da paleta. Na D-552 o campo
   * do preset passou a significar a TEXTURA, e quem aplica escreve o valor em
   * `fundo_editorial`. Ou seja: todo preset salvo desde então guardava uma cor
   * onde se espera uma textura, e aplicá-lo caía no padrão do canal. Foi
   * exatamente essa cor ("verdeProfundo") que derrubou a tela na D-554 — lá eu
   * fiz a leitura degradar, e a origem continuou intacta até agora.
   *
   * `ajustes` não existia, e é o tamanho das janelas (D-559).
   */
  const comoEstaHoje = (): PalcoShortPreset => ({
    arranjo: short.arranjo_palco,
    janela_cheia: short.janela_cheia,
    recortes: short.recortes_palco ?? {},
    ajustes: short.ajustes_palco ?? {},
    fundo: short.fundo_editorial ?? '',
    legenda_cor: short.legenda_cor ?? '',
  });

  // D-552: aplicar um preset COPIA os valores — e agora marca de onde vieram.
  //
  // Sem a marca, o operador criava um palco, aplicava, e o select do painel
  // seguia dizendo "ajustado à mão". A marca cai sozinha assim que ele mexer em
  // qualquer um destes campos por fora (o backend cuida disso), porque um
  // rótulo que sobrevive à edição do que descreve passa a mentir.
  const aplicarPreset = (id: string, payload: PalcoShortPreset) =>
    onAplicar(mudancaDoPalco(id, payload));

  const presetDoCorte = usePalcoDoCorte(corteId);
  // D-563: escolher a cor do realce sem ver a legenda seria escolher no escuro —
  // o mesmo defeito do seletor de fundo antes da D-552. O player fica pausado
  // enquanto o modal está aberto (`VideoEspelho`), então o instante é o que ele
  // deixou na régua, e a palavra realçada é a daquele momento.
  const transcricao = useTranscricaoDoCorte(corteId);

  // D-500 aplicada aqui: durante o arraste o backend resolve um plano
  // hipotético e a prévia desenha ESSE. Sem isto o retângulo andaria vazio —
  // o vídeo dentro dele só reflui no refetch, depois de soltar — que é
  // exatamente o defeito que a D-500 corrigiu na página.
  const simulacao = useSimulacaoDePalco(short.id);
  const planoNaTela = simulacao.simulado ?? plano;

  /** Ajuste é PARCIAL: mandar só o bloco na mão apagaria a posição dos outros. */
  const gravarAjuste = (ajustes: Record<string, Retangulo>) =>
    onAplicar({ ajustes_palco: { ...(short.ajustes_palco ?? {}), ...ajustes } });

  // D-559: o tamanho do palco dentro do quadro.
  //
  // Redimensiona a partir dos slots RESOLVIDOS (modelo + ajustes), e não do
  // modelo cru: é assim que cada clique compõe com o anterior e com o que o
  // operador já tinha arrastado à mão. O caminho de volta é limpar os ajustes,
  // que devolve o tamanho do arranjo sem precisar guardar percentual nenhum —
  // uma coluna a mais aqui seria um segundo lugar dizendo a mesma coisa, e os
  // dois divergiriam no primeiro arraste.
  const slotsAgora = plano?.slots ?? {};
  const ocupacao = ocupacaoDoPalco(slotsAgora);
  const redimensionar = (fator: number) =>
    onAplicar({ ajustes_palco: redimensionarPalco(slotsAgora, fator) });

  return (
    <Modal open={open} onClose={onClose} title="Definir o palco deste short" size="2xl">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <Secao numero={1} titulo="Como a tela monta">
            <div className="space-y-1">
              {(arranjos.data?.arranjos ?? []).map((arranjo) => (
                <button
                  key={arranjo.chave}
                  type="button"
                  disabled={ocupado || !arranjo.possivel}
                  onClick={() => onAplicar({ arranjo_palco: arranjo.chave })}
                  className={cn(
                    'w-full rounded-[8px] border px-2.5 py-2 text-left transition-colors disabled:opacity-45',
                    short.arranjo_palco === arranjo.chave
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold">{arranjo.nome}</span>
                    {short.arranjo_palco === arranjo.chave && (
                      <Check size={12} className="text-[var(--wb-accent-strong)]" aria-hidden />
                    )}
                  </div>
                  {/* O impedimento no lugar do porquê: a opção desabilitada
                      precisa dizer o que falta, senão vira adivinhação. */}
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
                    {arranjo.possivel ? arranjo.porque : arranjo.impedimento}
                  </p>
                </button>
              ))}
            </div>
          </Secao>

          <Secao numero={2} titulo="De onde vem cada janela">
            {/* D-552: o preset de RECORTES do canal (o que traz as regiões)
                mudou de lugar. Ele vivia no painel do candidato, ao lado do
                select de palco, e os dois pareciam a mesma coisa — foi assim
                que o operador criou um palco e foi procurá-lo na lista errada.
                Aqui ele está junto do que descreve: de onde sai cada janela. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
                preset de recortes
              </span>
              <select
                aria-label="Preset de recortes deste short"
                value={short.palco_preset}
                disabled={ocupado || !presetDoCorte.data}
                onChange={(e) => onAplicar({ palco_preset: e.target.value })}
                className="h-7 max-w-[220px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
              >
                <option value="">
                  {presetDoCorte.data?.preset
                    ? `do corte (${presetDoCorte.data.preset})`
                    : 'do corte (nenhum)'}
                </option>
                {presetDoCorte.data?.presets_disponiveis.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.nome}
                  </option>
                ))}
              </select>
            </div>
            {regioesEmJogo.length === 0 ? (
              <p className="text-[11.5px] text-[var(--wb-text-mute)]">
                Nenhuma região marcada neste corte — escolha um preset de recortes ou marque à
                mão sobre o player.
              </p>
            ) : (
              <>
                {/* Em CHEIA há uma janela só, e escolher a fonte É escolher o
                    enquadramento — não são dois controles. */}
                {short.arranjo_palco === 'cheia' && Object.keys(recortesDaFonte).length > 1 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
                      preenche com
                    </span>
                    {Object.keys(recortesDaFonte).map((regiao) => (
                      <Button
                        key={regiao}
                        size="sm"
                        variant={short.janela_cheia === regiao ? 'secondary' : 'outline'}
                        disabled={ocupado}
                        onClick={() => onAplicar({ janela_cheia: regiao })}
                      >
                        {REGIAO[regiao] ?? regiao}
                      </Button>
                    ))}
                  </div>
                )}
                <div
                  className="relative overflow-hidden rounded-[8px] bg-black"
                  style={{ aspectRatio: `${fonte.largura || 16} / ${fonte.altura || 9}` }}
                >
                  <VideoEspelho origem={video} />
                  <EditorDeRecorte
                    recortes={recortesDaFonte}
                    fonte={fonte}
                    ativo
                    onGravar={(recortes) =>
                      onAplicar({
                        recortes_palco: { ...(short.recortes_palco ?? {}), ...recortes },
                      })
                    }
                  />
                </div>
                <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
                  Arraste os retângulos sobre o quadro da live. O que você não mexer continua
                  vindo do preset do corte.
                </p>
              </>
            )}
          </Secao>

          {/* D-558: "O enquadramento" saiu daqui, e o operador estava certo.
              O `foco_x` é onde a janela 9:16 se centra no quadro CRU — e o
              `arranjo_short` já dizia, desde que nasceu, que ele "só vale
              quando não há região marcada". Dentro deste modal sempre há: as
              seções 1 e 2 acabaram de definir o arranjo e o recorte de cada
              janela. O controle empurrava um número que o render nunca ia ler.
              Um botão que não faz nada é pior que um botão que falta: ele
              consome atenção e ensina uma mecânica errada.
              O campo continua no banco e continua governando o caminho SEM
              palco — que é o único onde ele age. */}
          <Secao numero={3} titulo="O tamanho e o lugar na tela">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                aria-label="Diminuir o palco"
                disabled={ocupado || !plano}
                onClick={() => redimensionar(1 / PASSO_DO_TAMANHO)}
              >
                <Minimize2 />
              </Button>
              <span className="w-[46px] text-center font-code text-[12px] tabular-nums">
                {Math.round(ocupacao * 100)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label="Aumentar o palco"
                disabled={ocupado || !plano}
                onClick={() => redimensionar(PASSO_DO_TAMANHO)}
              >
                <Maximize2 />
              </Button>
              {/* D-562: o mesmo gesto que vivia na página, agora ao lado do
                  controle de tamanho — mover e dimensionar são a mesma decisão,
                  e estavam em duas telas. As alças aparecem sobre a prévia da
                  direita, que é fixa desde a D-558: dá para descer até aqui sem
                  perder de vista o que se está movendo. */}
              <Button
                size="sm"
                variant={movendo ? 'secondary' : 'outline'}
                disabled={ocupado || !plano}
                onClick={() => setMovendo((v) => !v)}
              >
                <Move />
                {movendo ? 'movendo' : 'mover no quadro'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={ocupado || !plano}
                onClick={() => onAplicar({ ajustes_palco: {} })}
              >
                voltar ao tamanho do arranjo
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              Quanto da largura do quadro o vídeo ocupa. Em tela cheia ele cobre os 100% e o
              fundo não aparece; abaixo disso o palco do canal fica visível em volta.
              {movendo && ' Arraste os blocos na prévia ao lado; os cantos redimensionam.'}
            </p>

            {/* D-562: os números vieram junto do arraste, e pelo mesmo motivo.
                Eles eram a metade PRECISA do mesmo gesto e viviam na página; se
                só o arraste tivesse mudado de lugar, eles ficariam sem nenhum
                jeito de aparecer. O arraste aproxima, o campo fecha — é a mesma
                dupla da régua e das bordas finas, só que aqui as duas ficam. */}
            {movendo && planoNaTela && (
              <div className="mt-2 border-t border-[var(--wb-border-soft)] pt-2">
                <CamposDoPalco
                  slots={planoNaTela.slots}
                  ajustados={planoNaTela.ajustados}
                  ocupado={ocupado}
                  onGravar={gravarAjuste}
                  onDesfazer={() => onAplicar({ ajustes_palco: {} })}
                />
              </div>
            )}
          </Secao>

          <Secao numero={4} titulo="A moldura">
            <select
              aria-label="Moldura do short"
              value={short.moldura}
              disabled={ocupado}
              onChange={(e) => onAplicar({ moldura: e.target.value })}
              className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
            >
              <option value="palco">Palco do canal</option>
              <option value="nenhuma">Sem moldura</option>
            </select>
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              A assinatura do canal em volta do short.
            </p>
          </Secao>

          <Secao numero={5} titulo="O fundo">
            {/* D-552: a TEXTURA, e não uma cor da paleta.
                O seletor anterior oferecia cores e escolher uma não mudava nada
                em lugar nenhum: no arquivo o PNG do palco cobre a cor, e na
                prévia os recortes cobrem. Era um controle com efeito zero. */}
            <SeletorDeTextura
              escolhida={short.fundo_editorial ?? ''}
              padrao={plano?.fundo_editorial ?? ''}
              ocupado={ocupado}
              onEscolher={(id) => onAplicar({ fundo_editorial: id })}
            />
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              A textura do canal por trás das janelas. Aparece na prévia ao lado.
            </p>
          </Secao>

          <Secao numero={6} titulo="A legenda">
            {/* D-563: a cor da palavra CORRENTE, e só dela.
                O resto da frase fica branco em short praticamente sempre — é o
                realce que diferencia, e é ele que precisa combinar com o palco.
                Dar cor às duas abriria a porta para uma legenda inteira num tom
                que some sobre o vídeo, e o contorno preto não salva o que já é
                escuro. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CORES_DA_LEGENDA.map((opcao) => {
                const ativa = (short.legenda_cor || CORES_DA_LEGENDA[0].hex) === opcao.hex;
                return (
                  <button
                    key={opcao.hex}
                    type="button"
                    disabled={ocupado}
                    title={opcao.nome}
                    aria-label={`Cor da legenda: ${opcao.nome}`}
                    aria-pressed={ativa}
                    // Clicar na que já está marcada volta ao acento do canal —
                    // é como se desfaz a escolha sem um botão "limpar" só disso.
                    onClick={() =>
                      onAplicar({ legenda_cor: opcao.hex === short.legenda_cor ? '' : opcao.hex })
                    }
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform disabled:opacity-50',
                      ativa
                        ? 'border-[var(--wb-accent)] ring-2 ring-[var(--wb-accent)]/40'
                        : 'border-[var(--wb-border)] hover:scale-110',
                    )}
                    style={{ background: opcao.hex }}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              A cor da palavra que está sendo dita. O resto da frase fica branco. Dá para ver
              na prévia ao lado enquanto o player anda.
            </p>
          </Secao>

          <Secao numero={7} titulo="Guardar como preset">
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="ex.: rosto cheio da live de terça"
                className="h-8 max-w-[260px] text-[12px]"
              />
              <Button
                size="sm"
                disabled={!nomeNovo.trim() || salvar.isPending}
                onClick={() =>
                  salvar.mutate(
                    {
                      nome: nomeNovo.trim(),
                      tipo: 'palco_short',
                      payload: comoEstaHoje(),
                    },
                    { onSuccess: () => setNomeNovo('') },
                  )
                }
              >
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
            </div>

            <ul className="mt-2 space-y-1">
              {(presets.data ?? []).map((preset) => (
                <li
                  key={preset.id}
                  className="flex flex-wrap items-center gap-1.5 rounded-[7px] border border-[var(--wb-border-soft)] px-2 py-1.5"
                >
                  {renomeando === preset.id ? (
                    <>
                      <Input
                        value={nomeEditado}
                        onChange={(e) => setNomeEditado(e.target.value)}
                        className="h-7 max-w-[200px] text-[12px]"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={!nomeEditado.trim() || renomear.isPending}
                        onClick={() =>
                          renomear.mutate(
                            { id: preset.id, body: { nome: nomeEditado.trim() } },
                            { onSuccess: () => setRenomeando(null) },
                          )
                        }
                      >
                        ok
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenomeando(null)}>
                        cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-[12px]">{preset.nome}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() =>
                          aplicarPreset(preset.id, preset.payload as unknown as PalcoShortPreset)
                        }
                      >
                        aplicar
                      </Button>
                      {/* D-561: regravar o preset com o palco de agora.
                          Faltava a metade de trás do ciclo. Dava para criar,
                          renomear e apagar; para MUDAR um preset, o caminho era
                          salvar outro com nome parecido — e a lista virava
                          quatro variações da mesma ideia, sem dizer qual valia.
                          O endpoint sempre aceitou payload; era a tela que só
                          oferecia o nome. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Grava neste preset o palco que está montado agora"
                        disabled={ocupado || regravar.isPending}
                        onClick={() =>
                          regravar.mutate({ id: preset.id, body: { payload: comoEstaHoje() } })
                        }
                      >
                        <RefreshCw />
                        regravar
                      </Button>
                      {/* Regravar não muda nada visível — o nome continua o
                          mesmo. Sem este aviso, o clique fica indistinguível de
                          um botão quebrado, que é a mesma lição do veredito do
                          rosto e da régua lisa. */}
                      {regravar.isSuccess && regravar.variables?.id === preset.id && (
                        <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-accent-strong)]">
                          regravado
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Renomear ${preset.nome}`}
                        onClick={() => {
                          setRenomeando(preset.id);
                          setNomeEditado(preset.nome);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Apagar ${preset.nome}`}
                        disabled={apagar.isPending}
                        onClick={() => apagar.mutate(preset.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              ))}
              {(presets.data ?? []).length === 0 && (
                <li className="text-[11.5px] text-[var(--wb-text-mute)]">
                  Nenhum preset de short ainda. Os do horizontal têm nomes de cena do OBS e
                  continuam servindo de atalho para os recortes — estes aqui são seus.
                </li>
              )}
            </ul>
          </Secao>
        </div>

        {/* A prévia acompanha cada decisão. Decidir olhando para o resultado é
            o que dispensa entender a mecânica por trás.

            D-558: e para acompanhar, ela precisa ficar PARADA. A coluna rolava
            junto com as seções, então escolher a moldura ou o fundo — que são
            justamente as decisões do fim da lista — se fazia às cegas: o
            operador descia até o controle e a prévia já tinha saído da tela.
            Uma prévia que some na hora de decidir não é prévia.

            `self-start` antes do `sticky`: item de grid estica por padrão, e um
            item da altura da linha inteira não tem para onde grudar. */}
        <div className="flex flex-col items-center gap-1 lg:sticky lg:top-0 lg:self-start">
          <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
            como vai sair
          </span>
          {planoNaTela ? (
            // Ao mover, a prévia cresce: as alças de canto ficam sobre a borda
            // do bloco, e num quadro de 220px de largura elas se sobrepõem umas
            // às outras. Foi por isso que redimensionar em tela cheia era
            // impossível de acertar com a mão antes da D-559.
            <div className={cn('w-full', movendo ? 'max-w-[300px]' : 'max-w-[220px]')}>
              <PalcoPrevia plano={planoNaTela} video={video}>
                {transcricao.data && (
                  <LegendaPrevia
                    palavras={transcricao.data.palavras}
                    inicioSeg={short.inicio_seg}
                    fimSeg={short.fim_seg}
                    tempoAtualSeg={tempoAtualSeg}
                    cor={short.legenda_cor}
                  />
                )}
                <EditorDePalco
                  slots={planoNaTela.slots}
                  ativo={movendo}
                  onGravar={gravarAjuste}
                  onArrastando={simulacao.simular}
                  onSoltou={simulacao.encerrar}
                />
              </PalcoPrevia>
            </div>
          ) : (
            <p className="text-[11.5px] text-[var(--wb-text-mute)]">
              Sem região marcada, o short sai do recorte simples do quadro.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Secao({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--wb-bg-inset)] font-code text-[9.5px] font-bold text-[var(--wb-text-mute)]">
          {numero}
        </span>
        <span className="font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          {titulo}
        </span>
      </h3>
      {children}
    </section>
  );
}

/**
 * O mesmo `<video>` do player, espelhado dentro do modal.
 *
 * Um segundo elemento apontando para o mesmo arquivo baixaria o bruto de novo e
 * ficaria fora de sincronia com o player. Aqui o quadro corrente é copiado para
 * um canvas, que é barato e nunca discorda do que o operador está vendo.
 */
function VideoEspelho({ origem }: { origem: React.RefObject<HTMLVideoElement | null> }) {
  const tela = useRef<HTMLCanvasElement>(null);

  // D-547: PAUSAR o player ao abrir o modal.
  //
  // O espelho segue o video ao vivo, entao com o player rodando o quadro
  // escorria enquanto o operador tentava marcar o recorte sobre ele — mirar um
  // retangulo num alvo em movimento. Congelar o espelho sozinho nao serve: ele
  // pararia no instante da montagem, e ao mexer na regua o operador marcaria
  // olhando para outro momento.
  //
  // Pausar a FONTE resolve os dois: o quadro fica parado para marcar, e
  // continua obedecendo a regua quando ele quiser outro instante.
  useEffect(() => {
    origem.current?.pause();
  }, [origem]);

  // Um laço, e não um desenho único: sem ele o espelho congela no quadro que
  // existia quando o modal montou, e o operador marca o recorte olhando para um
  // instante que não é o que ele escolheu na régua.
  useEffect(() => {
    let vivo = true;
    const desenhar = () => {
      if (!vivo) return;
      requestAnimationFrame(desenhar);
      const canvas = tela.current;
      const fonte = origem.current;
      const ctx = canvas?.getContext('2d');
      // `readyState < 2` = nenhum quadro decodificado. Desenhar aqui levanta
      // InvalidStateError em alguns navegadores e pinta lixo nos outros.
      if (!canvas || !ctx || !fonte || fonte.readyState < 2) return;
      if (canvas.width !== fonte.videoWidth) canvas.width = fonte.videoWidth;
      if (canvas.height !== fonte.videoHeight) canvas.height = fonte.videoHeight;
      ctx.drawImage(fonte, 0, 0);
    };
    desenhar();
    return () => {
      vivo = false;
    };
  }, [origem]);

  return <canvas ref={tela} className="absolute inset-0 h-full w-full" />;
}
