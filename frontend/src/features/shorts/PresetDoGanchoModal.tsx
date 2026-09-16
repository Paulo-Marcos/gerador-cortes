import { useState, type RefObject } from 'react';
import { Loader2, Minus, Plus, Save, Trash2 } from 'lucide-react';
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
import type { GanchoShortPreset } from '@/types/presets';
import {
  CORES_DO_GANCHO,
  DURACAO_MAX_SEG,
  DURACAO_MIN_SEG,
  DURACAO_PASSO_SEG,
  duracaoEfetiva,
  REALCES_DO_GANCHO,
  realceValido,
  TAMANHO_MAX,
  TAMANHO_MIN,
  TAMANHO_PASSO,
  tamanhoEfetivo,
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PASSO,
  lugarEfetivo,
  type LugarDoGancho,
} from './ganchoDoShort';
import { GanchoPrevia } from './GanchoPrevia';
import { FONTES_DA_LEGENDA, LegendaPrevia } from './LegendaPrevia';
import { lugarDaLegenda } from './previaLegenda';
import { PalcoPrevia } from './PalcoPrevia';
import type { PalavraTranscrita, PlanoDesenhavel, ShortSugerido } from './shortsApi';
import { useDefinirGanchoPadrao, useInvalidarPadroes } from './useShortsDoCorte';

// D-594: onde a APARÊNCIA do gancho vira um preset com nome.
//
// O `GanchoModal` continua sendo onde se escreve o TEXTO de um trecho — cada
// short promete uma coisa. Aqui mora o que se repete nos oito trechos de um
// corte: cor, destaque, fonte, tamanho e duração. Separar os dois é o que evita
// o operador escolher "amarelo com caixa" oito vezes.
//
// A prévia usa o gancho do trecho em foco quando ele tem um; senão, uma frase de
// amostra. O que se julga aqui é a aparência, e ela só se julga com texto.

const TEXTO_DE_AMOSTRA = 'ninguém te conta isso sobre juros';
const INSTANTE_DA_PREVIA_SEG = 0.5;

interface Props {
  onClose: () => void;
  corteId: string;
  /** `null` = criar um preset novo. */
  presetId: string | null;
  /** O trecho em foco — empresta o texto e o quadro para a prévia. */
  amostra: ShortSugerido | undefined;
  plano: PlanoDesenhavel | null;
  video: RefObject<HTMLVideoElement | null>;
  palavras: PalavraTranscrita[];
}

interface PresetCarregado {
  id: string;
  nome: string;
  payload: Partial<GanchoShortPreset>;
}

export function PresetDoGanchoModal(props: Props) {
  const presets = useLayoutPresets({ tipo: 'gancho_short' });
  const achado = props.presetId
    ? (presets.data ?? []).find((p) => p.id === props.presetId)
    : undefined;

  // O estado do editor nasce do preset; montá-lo antes de a lista chegar o
  // faria nascer vazio e ignorar o preset quando ele aparecesse.
  if (props.presetId && !achado) {
    return (
      <Modal open onClose={props.onClose} title="Editar o gancho padrão" size="sm">
        <p className="text-[12.5px] text-[var(--wb-text-dim)]">
          {presets.isLoading ? 'Carregando o preset…' : 'Este preset não existe mais.'}
        </p>
      </Modal>
    );
  }

  const preset: PresetCarregado | null = achado
    ? {
        id: achado.id,
        nome: achado.nome,
        payload: achado.payload as unknown as Partial<GanchoShortPreset>,
      }
    : null;

  return <EditorDoPresetDeGancho key={props.presetId ?? 'novo'} {...props} preset={preset} />;
}

function EditorDoPresetDeGancho({
  onClose,
  corteId,
  preset,
  amostra,
  plano,
  video,
  palavras,
}: Props & { preset: PresetCarregado | null }) {
  const inicial = preset?.payload ?? {};
  const [nome, setNome] = useState(preset?.nome ?? '');
  const [cor, setCor] = useState(inicial.cor ?? '');
  const [realce, setRealce] = useState(() => realceValido(inicial.realce));
  const [fonte, setFonte] = useState(inicial.fonte ?? '');
  const [tamanho, setTamanho] = useState(() => tamanhoEfetivo(inicial.tamanho));
  const [duracao, setDuracao] = useState(() => duracaoEfetiva(inicial.duracao));
  // D-600: o preset guarda o lugar PADRÃO do corte. O estado nasce resolvido
  // (o preset antigo não tem os campos e cai no ponto fixo de sempre) porque
  // aqui, ao contrário do modal do trecho, não há herança acima para preservar
  // — este É o padrão, e o que ele mostra é o que ele vai gravar.
  const [lugar, setLugar] = useState<LugarDoGancho>(() => lugarEfetivo(inicial, null));
  // Quem abre o editor pelo menu de padrões quer, quase sempre, o resultado
  // valendo para o corte. Desmarcar é a exceção.
  const [virarPadrao, setVirarPadrao] = useState(true);

  const salvar = useSaveLayoutPreset();
  const regravar = useUpdateLayoutPreset();
  const apagar = useDeleteLayoutPreset();
  const definirPadrao = useDefinirGanchoPadrao(corteId);
  const invalidarPadroes = useInvalidarPadroes(corteId);

  const gravando = salvar.isPending || regravar.isPending || definirPadrao.isPending;
  const erro = (salvar.error ?? regravar.error ?? definirPadrao.error ?? apagar.error)?.message;

  const onSalvar = async () => {
    const payload: GanchoShortPreset = { cor, realce, fonte, tamanho, duracao, ...lugar };
    try {
      const salvo = preset
        ? await regravar.mutateAsync({ id: preset.id, body: { nome: nome.trim(), payload } })
        : await salvar.mutateAsync({ nome: nome.trim(), tipo: 'gancho_short', payload });
      // Regravar o preset que já é o padrão muda o que os trechos herdam sem
      // trocar o id — sem invalidar, a prévia da página seguiria a cor velha.
      if (virarPadrao) await definirPadrao.mutateAsync(salvo.id);
      else invalidarPadroes();
      onClose();
    } catch {
      // O erro já está no estado da mutation e aparece no rodapé.
    }
  };

  const onApagar = () => {
    if (!preset || !confirm(`Apagar o preset de gancho "${preset.nome}"?`)) return;
    apagar.mutate(preset.id, {
      onSuccess: () => {
        invalidarPadroes();
        onClose();
      },
    });
  };

  const inicio = amostra?.inicio_seg ?? 0;
  const fim = amostra?.fim_seg ?? 30;
  const tempoDaPrevia = inicio + INSTANTE_DA_PREVIA_SEG;

  const sobreposicoes = (
    <>
      <GanchoPrevia
        texto={amostra?.gancho_tela?.trim() || TEXTO_DE_AMOSTRA}
        ateSeg={duracao}
        inicioSeg={inicio}
        fimSeg={fim}
        tempoAtualSeg={tempoDaPrevia}
        cor={cor}
        realce={realce}
        fonte={fonte}
        tamanho={tamanho}
        lugar={lugar}
        onMover={setLugar}
      />
      {amostra && palavras.length > 0 && (
        <LegendaPrevia
          palavras={palavras}
          inicioSeg={inicio}
          fimSeg={fim}
          tempoAtualSeg={tempoDaPrevia}
          cor={amostra.legenda_cor}
          fonte={amostra.legenda_fonte}
          segmentos={amostra.segmentos}
          // D-605: no lugar dela, para o gancho ser posicionado sabendo onde a
          // legenda está de verdade neste trecho.
          lugar={lugarDaLegenda(
            { x: plano?.legenda_x, y: plano?.legenda_y, largura: plano?.legenda_largura },
            amostra,
          )}
        />
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={preset ? `Editar o gancho "${preset.nome}"` : 'Novo gancho para o corte'}
      size="2xl"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <Campo titulo="Cor">
            <div className="flex flex-wrap items-center gap-1.5">
              {CORES_DO_GANCHO.map((opcao) => (
                <button
                  key={opcao.hex || 'branco'}
                  type="button"
                  title={opcao.nome}
                  aria-label={opcao.nome}
                  aria-pressed={cor === opcao.hex}
                  onClick={() => setCor(opcao.hex)}
                  className={cn(
                    'h-7 w-7 rounded-[7px] border-2 transition-transform',
                    cor === opcao.hex
                      ? 'scale-110 border-[var(--wb-accent)]'
                      : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
                  )}
                  style={{ backgroundColor: opcao.hex || '#ffffff' }}
                />
              ))}
              {/* A paleta cobre o comum; o seletor livre é para a cor do canal
                  que não está nela. O backend normaliza o hex de qualquer um. */}
              <input
                type="color"
                aria-label="Outra cor"
                title="Outra cor"
                value={cor || '#ffffff'}
                onChange={(e) => setCor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded-[7px] border border-[var(--wb-border)] bg-transparent"
              />
            </div>
          </Campo>

          <Campo titulo="Destaque">
            <div className="grid gap-1">
              {REALCES_DO_GANCHO.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  aria-pressed={realce === opcao.id}
                  onClick={() => setRealce(opcao.id)}
                  className={cn(
                    'flex items-baseline gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors',
                    realce === opcao.id
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                >
                  <span className="flex-none text-[12.5px] font-semibold">{opcao.nome}</span>
                  <span className="text-[11px] leading-snug text-[var(--wb-text-mute)]">
                    {opcao.nota}
                  </span>
                </button>
              ))}
            </div>
          </Campo>

          <Campo titulo="Fonte">
            {/* Cada opção desenhada na própria fonte, pelo motivo da legenda
                (D-563): a diferença entre elas é inteiramente visual. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {FONTES_DA_LEGENDA.map((opcao) => (
                <button
                  key={opcao.familia || 'padrao'}
                  type="button"
                  title={opcao.nome}
                  aria-label={`Fonte do gancho: ${opcao.nome}`}
                  aria-pressed={fonte === opcao.familia}
                  onClick={() => setFonte(opcao.familia)}
                  className={cn(
                    'rounded-[7px] border px-2 py-1 text-[15px] font-extrabold leading-none transition-colors',
                    fonte === opcao.familia
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                  style={{ fontFamily: opcao.familia || undefined }}
                >
                  Aa
                </button>
              ))}
            </div>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo titulo="Tamanho">
              <Passo
                rotulo={`${Math.round(tamanho * 100)}%`}
                menos={() => setTamanho((v) => tamanhoEfetivo(v - TAMANHO_PASSO))}
                mais={() => setTamanho((v) => tamanhoEfetivo(v + TAMANHO_PASSO))}
                noMinimo={tamanho <= TAMANHO_MIN}
                noMaximo={tamanho >= TAMANHO_MAX}
                nome="o tamanho"
              />
            </Campo>
            <Campo titulo="Tempo em tela">
              <Passo
                rotulo={`${duracao.toFixed(1)}s`}
                menos={() => setDuracao((v) => duracaoEfetiva(v - DURACAO_PASSO_SEG))}
                mais={() => setDuracao((v) => duracaoEfetiva(v + DURACAO_PASSO_SEG))}
                noMinimo={duracao <= DURACAO_MIN_SEG}
                noMaximo={duracao >= DURACAO_MAX_SEG}
                nome="o tempo em tela"
              />
            </Campo>
          </div>

          {/* D-600: o lugar que todos os trechos do corte herdam. O gesto é
              arrastar na prévia ao lado; aqui fica a largura, que não tem alça,
              e o par de números, que é o que dá para repetir noutro preset. */}
          <Campo titulo="Onde ele fica">
            <div className="space-y-1.5">
              <Passo
                rotulo={`${Math.round(lugar.largura)}% de largura`}
                menos={() =>
                  setLugar((v) => ({
                    ...v,
                    largura: Math.max(LARGURA_MIN, v.largura - LARGURA_PASSO),
                  }))
                }
                mais={() =>
                  setLugar((v) => ({
                    ...v,
                    largura: Math.min(LARGURA_MAX, v.largura + LARGURA_PASSO),
                  }))
                }
                noMinimo={lugar.largura <= LARGURA_MIN}
                noMaximo={lugar.largura >= LARGURA_MAX}
                nome="a largura da caixa"
              />
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                Arraste o gancho na prévia ao lado — está em {Math.round(lugar.x)}% /{' '}
                {Math.round(lugar.y)}% do quadro. Cada trecho ainda pode mover o seu.
              </p>
            </div>
          </Campo>

          <Campo titulo="Guardar o preset">
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                aria-label="Nome do preset de gancho"
                placeholder="ex.: amarelo com caixa"
                className="h-8 max-w-[260px] text-[12px]"
              />
              <Button size="sm" disabled={!nome.trim() || gravando} onClick={() => void onSalvar()}>
                {gravando ? <Loader2 className="animate-spin" /> : <Save />}
                {preset ? 'Salvar alterações' : 'Criar preset'}
              </Button>
              {preset && (
                <Button size="sm" variant="ghost" disabled={apagar.isPending} onClick={onApagar}>
                  <Trash2 />
                  apagar
                </Button>
              )}
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]">
              <input
                type="checkbox"
                checked={virarPadrao}
                onChange={(e) => setVirarPadrao(e.target.checked)}
              />
              usar como gancho padrão deste corte
            </label>
            {erro && <p className="mt-1 text-[11.5px] text-[var(--wb-warn-ink)]">{erro}</p>}
          </Campo>
        </div>

        <aside className="space-y-1.5 lg:sticky lg:top-0 lg:self-start">
          {plano ? (
            <PalcoPrevia plano={plano} video={video}>
              {sobreposicoes}
            </PalcoPrevia>
          ) : (
            <div
              className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-black"
              style={{ aspectRatio: '9 / 16', containerType: 'inline-size' }}
            >
              {sobreposicoes}
            </div>
          )}
          <p className="text-center text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
            {amostra?.gancho_tela
              ? 'Com o gancho do trecho em foco, como sai no arquivo.'
              : 'Com uma frase de amostra — o trecho em foco ainda não tem gancho.'}
          </p>
        </aside>
      </div>
    </Modal>
  );
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Passo({
  rotulo,
  menos,
  mais,
  noMinimo,
  noMaximo,
  nome,
}: {
  rotulo: string;
  menos: () => void;
  mais: () => void;
  noMinimo: boolean;
  noMaximo: boolean;
  nome: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" aria-label={`Diminuir ${nome}`} disabled={noMinimo} onClick={menos}>
        <Minus />
      </Button>
      <span className="w-[46px] text-center font-code text-[13px] tabular-nums text-[var(--wb-text)]">
        {rotulo}
      </span>
      <Button variant="outline" size="sm" aria-label={`Aumentar ${nome}`} disabled={noMaximo} onClick={mais}>
        <Plus />
      </Button>
    </div>
  );
}
