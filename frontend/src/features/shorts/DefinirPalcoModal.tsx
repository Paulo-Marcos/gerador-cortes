import { useEffect, useRef, useState } from 'react';
import { Check, Maximize2, Minimize2, Move, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { PalcoShortPreset } from '@/types/presets';
import { EditorDeRecorte } from './EditorDeRecorte';
import { PresetsDoPalco } from './PresetsDoPalco';
import { PalcoDoCorte } from './PalcoDoCorte';
import { CamposDoPalco, EditorDePalco } from './EditorDePalco';
import { CORES_DA_LEGENDA, FONTES_DA_LEGENDA, LegendaPrevia } from './LegendaPrevia';
import {
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PASSO,
  lugarEfetivo,
  temLugarProprio,
  type LugarDaLegenda,
} from './previaLegenda';
import { useTranscricaoDoCorte } from './useShortsDoCorte';
import { useSimulacaoDePalco } from './useSimulacaoDePalco';
import { ocupacaoDoPalco, recorteInicial, redimensionarPalco } from './arrastarSlot';
import { PalcoPrevia } from './PalcoPrevia';
import { SeletorDeTextura } from './SeletorDeTextura';
import { mudancaDoArranjo, mudancaDoPalco, palcoDoShort } from './aplicarPalco';
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

/** As regiões que os arranjos pedem — as que faz sentido oferecer para marcar. */
const REGIOES_MARCAVEIS = ['pessoa', 'tela'];

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
  /**
   * D-594: montar um PRESET em vez do trecho, a partir do menu de padrões.
   *
   * Quem chama guarda as escritas num rascunho; aqui a simulação passa a
   * desenhar esse rascunho, e somem os controles que o preset não guarda —
   * moldura e preset de recortes. Um controle cuja escolha não é salva é pior
   * que um que falta: o operador ajusta, salva, e o preset sai sem aquilo.
   */
  rascunho?: { campos: Record<string, unknown>; titulo: string; rodape: React.ReactNode };
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
  rascunho,
}: Props) {
  const arranjos = useArranjosDePalco(corteId);

  // D-562: mover as janelas dentro do quadro, aqui dentro.
  //
  // O gesto existia na página, sobre a prévia pequena ao lado do player, e o
  // operador gostou dele. O lugar é que era errado: mover uma janela é a mesma
  // decisão que dimensioná-la, e dimensionar já mora na seção 3 daqui. Ter as
  // duas metades em telas diferentes obrigava a sair do modal no meio da
  // decisão — e a prévia da página não é fixa.
  const [movendo, setMovendo] = useState(false);

  // TODAS as regiões do trecho, e não só as que o arranjo recorta: em tela
  // cheia o plano tem uma janela só, e a tela — que a dividida exige — sumia
  // do editor. O mapa dos recortes fica de reserva para um backend antigo.
  const recortesDaFonte: Record<string, Retangulo> =
    plano?.regioes ??
    Object.fromEntries((plano?.recortes ?? []).map((r) => [r.regiao, r.origem]));
  const faltando = REGIOES_MARCAVEIS.filter((regiao) => !(regiao in recortesDaFonte));
  const fonteMedida = fonte.largura > 0 && fonte.altura > 0;

  /** Cria a região que falta num lugar plausível; dali o operador arrasta. */
  const marcarRegiao = (regiao: string) =>
    onAplicar({
      recortes_palco: {
        ...(short.recortes_palco ?? {}),
        [regiao]: recorteInicial(regiao, fonte),
      },
    });

  /** O palco deste short, no formato que o preset guarda (ver `palcoDoShort`). */
  const comoEstaHoje = (): PalcoShortPreset => palcoDoShort(short);

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
  const simulacao = useSimulacaoDePalco(short.id, rascunho?.campos);
  const planoNaTela = simulacao.simulado ?? plano;

  // O catálogo e o arranjo em uso vêm do PLANO, que resolve as regiões deste
  // trecho (recortes dele e do palco padrão). O catálogo por corte fica só
  // enquanto o plano não chega: julgado pelas regiões do corte, um corte nunca
  // posicionado desabilitava todos os arranjos de um trecho que monta palco.
  const catalogoDeArranjos = planoNaTela?.arranjos ?? arranjos.data?.arranjos ?? [];
  const arranjoEmUso = planoNaTela?.arranjo ?? short.arranjo_palco;

  // O rascunho do arraste vive até o plano novo chegar — a mesma regra da
  // página. Sem isto a última simulação ficava por cima para sempre, e trocar
  // o fundo depois de mover um bloco não mudava nada na prévia.
  const descartarSimulacao = simulacao.descartar;
  useEffect(() => descartarSimulacao(), [plano, descartarSimulacao]);

  // D-605: onde a legenda senta, com a cascata já resolvida.
  //
  // O PRÓPRIO do short vence; na falta dele vale o que o plano devolveu (o palco
  // padrão do corte, resolvido no backend); na falta dos dois, o lugar de sempre.
  // A prévia lê daqui, e não do short cru — lida do short, ela ignoraria o padrão
  // do corte e desenharia a legenda num ponto que o arquivo não usa.
  const lugarGravado = lugarEfetivo(
    { x: short.legenda_x, y: short.legenda_y, largura: short.legenda_largura },
    { x: plano?.legenda_x, y: plano?.legenda_y, largura: plano?.legenda_largura },
  );
  // O arraste vive aqui até soltar — a prévia redesenha a cada movimento sem
  // gastar um PATCH por pixel, do mesmo jeito que a simulação do palco faz.
  const [arrastandoLegenda, setArrastandoLegenda] = useState<LugarDaLegenda | null>(null);
  const lugarDaLegenda = arrastandoLegenda ?? lugarGravado;
  const legendaNoLugarDela = temLugarProprio(short);

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
    <Modal
      open={open}
      onClose={onClose}
      title={rascunho?.titulo ?? 'Definir o palco deste short'}
      size="2xl"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <Secao numero={1} titulo="Como a tela monta">
            <div className="space-y-1">
              {catalogoDeArranjos.map((arranjo) => (
                <button
                  key={arranjo.chave}
                  type="button"
                  // Bloqueado só por falta de região NÃO é bloqueado: o clique
                  // marca o que falta e aplica o arranjo. Travar aqui e mandar
                  // marcar lá embaixo fazia a dividida parecer quebrada.
                  disabled={ocupado || (!arranjo.possivel && !fonteMedida)}
                  onClick={() =>
                    onAplicar(
                      mudancaDoArranjo(
                        arranjo.chave,
                        arranjo.possivel ? [] : faltando,
                        short.recortes_palco ?? {},
                        fonte,
                      ),
                    )
                  }
                  className={cn(
                    'w-full rounded-[8px] border px-2.5 py-2 text-left transition-colors disabled:opacity-45',
                    arranjoEmUso === arranjo.chave
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold">{arranjo.nome}</span>
                    {arranjoEmUso === arranjo.chave && (
                      <Check size={12} className="text-[var(--wb-accent-strong)]" aria-hidden />
                    )}
                  </div>
                  {/* O impedimento no lugar do porquê: a opção desabilitada
                      precisa dizer o que falta, senão vira adivinhação. */}
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
                    {arranjo.possivel
                      ? arranjo.porque
                      : `${arranjo.impedimento} — clique para marcar e ajuste o retângulo em "De onde vem cada janela".`}
                  </p>
                </button>
              ))}
            </div>
          </Secao>

          <Secao numero={2} titulo="De onde vem cada janela">
            {/* D-570: o RECORTES DO CORTE mudou de casa — estava no topo da
                tela, ocupando o lugar que o palco merecia.
                Ele responde de onde sai cada janela: onde estão a pessoa e a
                tela dentro do quadro do OBS. Por isso os nomes são cenas do OBS
                — eles descrevem a transmissão, não o short. É infraestrutura,
                quase sempre já resolvida pelas regiões marcadas no editor do
                horizontal; o operador raramente precisa tocá-lo, e mesmo assim
                era a primeira pergunta da tela.
                O diagnóstico vem junto, e é o que mais importa aqui: sem região
                marcada o palco usa o quadro inteiro e a moldura da live entra
                no short. Um short torto tem que dizer por que está torto. */}
            <div className="mb-2 rounded-[7px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
              <PalcoDoCorte corteId={corteId} />
            </div>
            {/* D-552: o preset de RECORTES do canal (o que traz as regiões)
                mudou de lugar. Ele vivia no painel do candidato, ao lado do
                select de palco, e os dois pareciam a mesma coisa — foi assim
                que o operador criou um palco e foi procurá-lo na lista errada.
                Aqui ele está junto do que descreve: de onde sai cada janela. */}
            {!rascunho && (
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
            )}
            {/* O "marque à mão" precisava existir de verdade. O editor só
                arrastava regiões que já havia: sem a tela, a dividida ficava
                bloqueada e o texto mandava marcar num lugar sem botão. */}
            {faltando.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
                  marcar
                </span>
                {faltando.map((regiao) => (
                  <Button
                    key={regiao}
                    size="sm"
                    variant="outline"
                    disabled={ocupado || !fonteMedida}
                    title={fonteMedida ? undefined : 'Espere o vídeo carregar: o recorte usa a resolução dele.'}
                    onClick={() => marcarRegiao(regiao)}
                  >
                    <Plus />
                    {REGIAO[regiao] ?? regiao}
                  </Button>
                ))}
                <span className="text-[11px] text-[var(--wb-text-mute)]">
                  {Object.keys(recortesDaFonte).length === 0
                    ? 'Nenhuma região ainda: escolha um preset de recortes ou marque aqui e ajuste o retângulo sobre a live.'
                    : 'A tela dividida precisa da pessoa e da tela.'}
                </span>
              </div>
            )}
            {Object.keys(recortesDaFonte).length > 0 && (
              <>
                {/* Em CHEIA há uma janela só, e escolher a fonte É escolher o
                    enquadramento — não são dois controles. */}
                {arranjoEmUso === 'cheia' && Object.keys(recortesDaFonte).length > 1 && (
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

          {!rascunho && (
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
          )}

          <Secao numero={rascunho ? 4 : 5} titulo="O fundo">
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

          <Secao numero={rascunho ? 5 : 6} titulo="A legenda">
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

            {/* D-563: cada opção desenhada NA PRÓPRIA FONTE.
                Um select com os nomes obrigaria o operador a saber de cabeça
                como "Oswald" se parece — e a diferença entre estas cinco é
                inteiramente visual. O nome sozinho não decide nada. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {FONTES_DA_LEGENDA.map((opcao) => {
                const ativa = short.legenda_fonte === opcao.familia;
                return (
                  <button
                    key={opcao.familia || 'padrao'}
                    type="button"
                    disabled={ocupado}
                    title={opcao.nome}
                    aria-label={`Fonte da legenda: ${opcao.nome}`}
                    aria-pressed={ativa}
                    onClick={() => onAplicar({ legenda_fonte: opcao.familia })}
                    className={cn(
                      'rounded-[7px] border px-2 py-1 text-[15px] font-extrabold leading-none transition-colors disabled:opacity-50',
                      ativa
                        ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                        : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-inset)]',
                    )}
                    style={{ fontFamily: opcao.familia || undefined }}
                  >
                    Aa
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              A fonte da legenda queimada. Passe o mouse para o nome de cada uma.
            </p>

            {/* D-605: ONDE ela senta.
                O relato: "a depender do Palco, ela fica em cima da pessoa". Quem
                decide onde a pessoa aparece no vertical é o arranjo — então o
                lugar da legenda pertence a esta seção, e não a uma tela nova.
                O gesto é ARRASTAR na prévia ao lado, e não digitar dois números:
                a pergunta "está em cima de alguém?" só se responde olhando. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--wb-border-soft)] pt-2.5">
              <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
                largura
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || lugarDaLegenda.largura <= LARGURA_MIN}
                onClick={() =>
                  onAplicar({
                    legenda_largura: Math.max(
                      LARGURA_MIN,
                      lugarDaLegenda.largura - LARGURA_PASSO,
                    ),
                  })
                }
                aria-label="Estreitar a legenda"
              >
                <Minimize2 size={12} aria-hidden />
              </Button>
              <span className="font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]">
                {Math.round(lugarDaLegenda.largura)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || lugarDaLegenda.largura >= LARGURA_MAX}
                onClick={() =>
                  onAplicar({
                    legenda_largura: Math.min(
                      LARGURA_MAX,
                      lugarDaLegenda.largura + LARGURA_PASSO,
                    ),
                  })
                }
                aria-label="Alargar a legenda"
              >
                <Maximize2 size={12} aria-hidden />
              </Button>
              {/* Só aparece quando há o que desfazer: um botão "voltar ao
                  padrão" sempre visível sobre um trecho que já segue o padrão é
                  um controle que não faz nada. */}
              {legendaNoLugarDela && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  onClick={() =>
                    onAplicar({ legenda_x: 0, legenda_y: 0, legenda_largura: 0 })
                  }
                >
                  voltar ao lugar do palco
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              {movendo
                ? 'Solte "mover o palco" para arrastar a legenda: os dois usam o mesmo gesto na prévia.'
                : legendaNoLugarDela
                  ? 'Arraste a legenda na prévia para mudar de lugar. Este trecho já tem lugar próprio.'
                  : 'Arraste a legenda na prévia para tirá-la de cima de quem está no quadro. Sem arrastar, ela segue o palco do corte.'}
            </p>
          </Secao>

          {rascunho ? (
            <Secao numero={6} titulo="Guardar o preset">
              {rascunho.rodape}
            </Secao>
          ) : (
          <Secao numero={7} titulo="Guardar como preset">
            {/* D-567: o ciclo do preset mora em `PresetsDoPalco`.
                Ele era uma classe escondida aqui dentro — 130 linhas, tres
                estados e quatro mutacoes declaradas no topo deste componente, e
                nenhum deles usado em mais lugar nenhum. O que sobrou aqui e o
                que e mesmo deste modal: o numero da secao e a foto do palco de
                agora, que so ele sabe tirar porque so ele conhece os sete
                controles que a compoem. */}
            <PresetsDoPalco
              comoEstaHoje={comoEstaHoje}
              onAplicar={aplicarPreset}
              ocupado={ocupado}
            />
          </Secao>
          )}
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
                    fonte={short.legenda_fonte}
                    lugar={lugarDaLegenda}
                    // D-605: um gesto por vez. O editor de palco e a legenda
                    // arrastam no MESMO quadro, e com os dois ativos a caixa da
                    // legenda roubaria o ponteiro de quem está movendo um bloco
                    // — sem nada na tela explicando por que o bloco não anda.
                    onMover={movendo ? undefined : setArrastandoLegenda}
                    // O gesto grava os TRÊS campos, inclusive a largura: uma
                    // caixa que anda sem levar o próprio tamanho voltaria a
                    // herdá-lo na primeira troca de palco, e o operador veria a
                    // legenda que ele posicionou mudar de forma sozinha.
                    onSoltar={(lugar) => {
                      setArrastandoLegenda(null);
                      onAplicar({
                        legenda_x: lugar.x,
                        legenda_y: lugar.y,
                        legenda_largura: lugar.largura,
                      });
                    }}
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
