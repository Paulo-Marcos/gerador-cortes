import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Save, Trash2 } from 'lucide-react';
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
import { PalcoPrevia } from './PalcoPrevia';
import { SeletorDeFundo } from './SeletorDeFundo';
import { ControlesDeFoco } from './CampoDeFoco';
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
  onAplicar,
}: Props) {
  const arranjos = useArranjosDePalco(corteId);
  const presets = useLayoutPresets({ tipo: 'palco_short' });
  const salvar = useSaveLayoutPreset();
  const renomear = useUpdateLayoutPreset();
  const apagar = useDeleteLayoutPreset();

  const [nomeNovo, setNomeNovo] = useState('');
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  const recortesDaFonte: Record<string, Retangulo> = Object.fromEntries(
    (plano?.recortes ?? []).map((r) => [r.regiao, r.origem]),
  );
  const regioesEmJogo = Object.keys(plano?.slots ?? {});

  const comoEstaHoje = (): PalcoShortPreset => ({
    arranjo: short.arranjo_palco,
    janela_cheia: short.janela_cheia,
    recortes: short.recortes_palco ?? {},
    fundo: short.fundo_palco ?? '',
  });

  const aplicarPreset = (payload: PalcoShortPreset) =>
    onAplicar({
      arranjo_palco: payload.arranjo ?? '',
      janela_cheia: payload.janela_cheia ?? '',
      recortes_palco: payload.recortes ?? {},
      fundo_palco: payload.fundo ?? '',
    });

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

          <Secao numero={3} titulo="O enquadramento">
            {/* D-542: veio do painel do candidato, onde as setas empurravam a
                janela 9:16 SEM previa ao lado — metade do trabalho. Aqui o
                resultado esta na tela enquanto se empurra. */}
            <ControlesDeFoco
              valor={short.foco_efetivo}
              ocupado={ocupado}
              onAplicar={(fracao) => onAplicar({ foco_x: Number(fracao.toFixed(3)) })}
            />
            <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
              Onde fica o centro da janela vertical, em % da largura do quadro.
            </p>
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
            <SeletorDeFundo
              escolhido={short.fundo_palco ?? ''}
              ocupado={ocupado}
              onEscolher={(chave) => onAplicar({ fundo_palco: chave })}
            />
          </Secao>

          <Secao numero={6} titulo="Guardar como preset">
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
                          aplicarPreset(preset.payload as unknown as PalcoShortPreset)
                        }
                      >
                        aplicar
                      </Button>
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
            o que dispensa entender a mecânica por trás. */}
        <div className="flex flex-col items-center gap-1">
          <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
            como vai sair
          </span>
          {plano ? (
            <div className="w-full max-w-[220px]">
              <PalcoPrevia plano={plano} video={video} />
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
