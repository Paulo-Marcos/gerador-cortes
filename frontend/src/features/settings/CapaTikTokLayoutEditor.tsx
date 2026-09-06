import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { BlocosArrastaveis } from '@/features/shorts/BlocosArrastaveis';
import type { Retangulo } from '@/features/shorts/arrastarSlot';

// D-532: onde cada componente da capa do TikTok fica.
//
// A estrutura da capa foi aprovada; o que faltava era mandar nela. Antes, mover
// o título dois dedos para cima era uma demanda — agora é um arraste.
//
// ## A geometria vem do backend, sempre
//
// O editor não recalcula nada: pede a posição resolvida e devolve a que o
// operador soltou. Repetir a conta aqui criaria a divergência que esta frente
// inteira evitou — um pixel entre o que se arrasta e o que o Remotion desenha,
// sem erro nenhum aparecendo.
//
// ## A faixa segura é desenhada, não explicada
//
// A vitrine do perfil recorta a capa no centro (~3:4), e é dentro daquele
// retângulo que tudo precisa ficar para sobreviver ao corte. Dizer isso num
// aviso seria pedir que o operador imaginasse; a guia tracejada deixa a conta
// na tela, e a decisão de estourá-la passa a ser informada.

const NOMES: Record<string, string> = {
  etiqueta: 'Título',
  arte: 'Imagem',
  selo: 'E-mail do canal',
};

function emPixelInteiro(r: Retangulo): Retangulo {
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
}

/**
 * Quem escapou do que a vitrine mostra (D-536).
 *
 * A guia tracejada já diz onde é o limite, mas ela só ajuda quem está olhando
 * na hora do arraste. Um layout salvo meses atrás — ou salvo contra um recorte
 * que a gente ainda estimava errado — continua ali, silencioso, e o operador só
 * descobre depois de publicar. A lista nomeia o componente e transforma isso em
 * decisão: ou ele arrasta de volta, ou restaura o padrão, ou aceita a perda.
 */
function foraDaVitrine(
  blocos: Record<string, Retangulo>,
  seguro: { y: number; h: number },
): string[] {
  return Object.entries(blocos)
    .filter(([, r]) => r.y < seguro.y || r.y + r.h > seguro.y + seguro.h)
    .map(([regiao]) => NOMES[regiao] ?? regiao);
}

interface LayoutDaCapa {
  quadro: { largura: number; altura: number };
  faixa_segura: { y: number; h: number };
  componentes: string[];
  lado_minimo: number;
  padrao: Record<string, Retangulo>;
  atual: Record<string, Retangulo>;
}

export function CapaTikTokLayoutEditor() {
  const queryClient = useQueryClient();
  const [blocos, setBlocos] = useState<Record<string, Retangulo> | null>(null);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState('');

  const layoutQuery = useQuery({
    queryKey: ['capa-tiktok-layout'],
    queryFn: api.obterLayoutCapaTiktok,
  });
  const layout = layoutQuery.data as LayoutDaCapa | undefined;

  // O rascunho nasce do servidor e só é resemeado enquanto ninguém mexeu:
  // sobrescrever um arraste em andamento por causa de um refetch faria o bloco
  // pular de volta sozinho.
  useEffect(() => {
    if (layout && !sujo) setBlocos(layout.atual);
  }, [layout, sujo]);

  const salvar = useMutation({
    mutationFn: (valor: Record<string, Retangulo> | null) =>
      api.atualizarSettings({ capa_tiktok_layout: valor ? JSON.stringify(valor) : '{}' }),
    onSuccess: () => {
      setErro('');
      setSujo(false);
      void queryClient.invalidateQueries({ queryKey: ['capa-tiktok-layout'] });
      void queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  if (layoutQuery.isLoading || !layout || !blocos) {
    return (
      <p className="text-[12px] text-[var(--wb-text-mute)]">
        <Loader2 className="mr-1 inline animate-spin" size={12} aria-hidden />
        carregando o layout da capa…
      </p>
    );
  }

  const { quadro, faixa_segura: seguro } = layout;
  const pct = (valor: number, total: number) => `${(valor / total) * 100}%`;
  const escapados = foraDaVitrine(blocos, seguro);

  return (
    <section className="grid gap-3">
      <header className="grid gap-0.5">
        <h3 className="text-[13px] font-bold text-[var(--wb-text)]">Layout da capa do TikTok</h3>
        <p className="text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          Arraste cada componente para onde quiser. O tracejado é o que a vitrine do perfil
          preserva — o que sair dali aparece no feed, mas some na grade do canal.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <div
          className="relative w-[210px] shrink-0 overflow-hidden rounded-[10px] border border-[var(--wb-border)] bg-[#0d1512]"
          style={{ aspectRatio: `${quadro.largura} / ${quadro.altura}` }}
        >
          {/* A guia do recorte da vitrine. */}
          <div
            className="pointer-events-none absolute left-0 right-0 border-y border-dashed border-[var(--wb-accent)]/50 bg-[var(--wb-accent)]/5"
            style={{ top: pct(seguro.y, quadro.altura), height: pct(seguro.h, quadro.altura) }}
          />
          <BlocosArrastaveis
            blocos={blocos}
            limites={{ largura: quadro.largura, altura: quadro.altura }}
            rotulo={(regiao) => NOMES[regiao] ?? regiao}
            substantivo="o componente"
            onSoltar={(regiao, retangulo) => {
              // Arredonda aqui: a conta do arraste é em fração de pixel do
              // preview, e "y242.30769230769232" na lista é ruído. O backend
              // arredonda de novo — aqui é para o operador ler um número.
              setBlocos((atual) => ({ ...(atual ?? {}), [regiao]: emPixelInteiro(retangulo) }));
              setSujo(true);
            }}
          />
        </div>

        <div className="grid min-w-[220px] flex-1 content-start gap-2">
          <ul className="grid gap-1">
            {layout.componentes.map((regiao) => {
              const r = blocos[regiao];
              if (!r) return null;
              return (
                <li
                  key={regiao}
                  className="flex items-baseline justify-between gap-2 font-code text-[11px] text-[var(--wb-text-mute)]"
                >
                  <span className="font-sans font-semibold text-[var(--wb-text)]">
                    {NOMES[regiao] ?? regiao}
                  </span>
                  <span className="tabular-nums">
                    x{r.x} y{r.y} · {r.w}×{r.h}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!sujo || salvar.isPending}
              onClick={() => salvar.mutate(blocos)}
            >
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar layout
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={salvar.isPending}
              onClick={() => {
                setBlocos(layout.padrao);
                setSujo(false);
                salvar.mutate(null);
              }}
              title="Volta os três componentes para as posições de fábrica."
            >
              <RotateCcw />
              Restaurar padrão
            </Button>
          </div>

          {escapados.length > 0 && (
            <p className="text-[11px] text-[var(--wb-warn-ink)]">
              Fora da vitrine do perfil: {escapados.join(', ')}. Aparece no feed, some na grade do
              canal.
            </p>
          )}
          {sujo && !salvar.isPending && (
            <p className="text-[11px] text-[var(--wb-warn-ink)]">Alterações ainda não salvas.</p>
          )}
          {erro && <p className="text-[11px] text-[var(--wb-err)]">{erro}</p>}
        </div>
      </div>
    </section>
  );
}
