import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShortSugerido, VereditoDoRosto } from './shortsApi';
import { janelaNova, mmss } from './linhaDoTempoShort';
import { comSegmentoNovo, efetivos, MAX_SEGMENTOS, resumo } from './segmentosDoShort';
import { mudancaDoPalco, SEGUIR_O_PALCO_PADRAO } from './aplicarPalco';
import { CandidatoCard } from './CandidatoCard';
import { GanchoPadraoDoCorte } from './GanchoPadraoDoCorte';
import { PalcoPadraoDoCorte } from './PalcoPadraoDoCorte';
import type { EdicaoDoShort } from './useEdicaoDoShort';
import {
  useCriarShortManual,
  useEnquadrarPeloRosto,
  useRenderizarPrevia,
  useRenderizarShort,
} from './useShortsDoCorte';

/**
 * D-477: o veredito do detector em uma linha.
 *
 * "Não achei" precisa de texto tanto quanto "achei": sem ele, um clique sem
 * efeito visível fica indistinguível de um botão quebrado.
 */
function textoDoVeredito(v: VereditoDoRosto): string {
  if (!v.achou) return `Não achei rosto — ${v.motivo}.`;
  const onde = `Enquadrado em ${Math.round((v.foco_x ?? 0) * 100)}% da largura (${v.motivo}).`;
  return v.aviso ? `${onde} ${v.aviso}` : onde;
}

interface Props {
  corteId: string;
  shorts: ShortSugerido[];
  /** Qual candidato o resto da tela está editando. */
  emFocoId: string | undefined;
  carregando: boolean;
  falhou: boolean;
  erroDaLista: unknown;
  /** O caminho ÚNICO de escrita: status e palco dos candidatos passam por ele. */
  edicao: EdicaoDoShort;
  tempoAtual: number;
  duracaoRegua: number;
  onSelecionar: (shortId: string) => void;
  onTocar: (short: ShortSugerido) => void;
  onBorda: (short: ShortSugerido, campo: 'inicio_seg' | 'fim_seg') => void;
  /** D-604: leva o player a um instante do bruto — clicar num pedaço vai até ele. */
  onIr: (segundos: number) => void;
  onDefinirPalco: (shortId: string) => void;
  onEscreverGancho: (shortId: string) => void;
  /** D-594: abrir o editor de preset de palco/gancho. `null` = novo. */
  onEditarPalcoPadrao: (presetId: string | null) => void;
  onEditarGanchoPadrao: (presetId: string | null) => void;
}

/**
 * D-492: o que FAZER com o material.
 *
 * Olhar e decidir são movimentos diferentes, e misturá-los foi o que produziu a
 * parede de botões que o operador reclamou. Esta coluna fica com as decisões: o
 * palco que vale para o corte inteiro, o trecho novo, e os candidatos.
 *
 * As mutações que só esta coluna dispara (criar, enquadrar pelo rosto, prévia e
 * render) moram aqui: o `isPending` de cada uma é lido por candidato
 * (`variables === short.id`), e quem sabe de que candidato se trata é a linha.
 */
export function ColunaDeDecisoes({
  corteId,
  shorts,
  emFocoId,
  carregando,
  falhou,
  erroDaLista,
  edicao,
  tempoAtual,
  duracaoRegua,
  onSelecionar,
  onTocar,
  onBorda,
  onIr,
  onDefinirPalco,
  onEscreverGancho,
  onEditarPalcoPadrao,
  onEditarGanchoPadrao,
}: Props) {
  // Só UM card mostra os ajustes por vez: cinco blocos de refino abertos ao
  // mesmo tempo reconstroem a parede de controles que a D-492 desmontou.
  const [ajusteAberto, setAjusteAberto] = useState<string | null>(null);

  const criarManual = useCriarShortManual(corteId);
  const enquadrarPeloRosto = useEnquadrarPeloRosto(corteId);
  const previa = useRenderizarPrevia(corteId);
  const renderizar = useRenderizarShort(corteId);
  const ocupado = edicao.ocupado || renderizar.isPending || previa.isPending;

  // O trecho novo já nasce selecionado e com os ajustes abertos: quem acabou de
  // criá-lo vai mexer nas bordas, e as alças agem sobre o candidato em foco.
  const onCriarManual = () => {
    const janela = janelaNova(tempoAtual, duracaoRegua);
    criarManual.mutate(
      { inicio_seg: janela.inicio, fim_seg: janela.fim },
      {
        onSuccess: ({ short }) => {
          onSelecionar(short.id);
          setAjusteAberto(short.id);
        },
      },
    );
  };

  return (
    <aside className="flex min-h-0 flex-col gap-2.5 overflow-auto">
      <div className="flex-none space-y-2 rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
        {/* D-570: o PALCO toma o lugar do RECORTES aqui.
            O RECORTES não sumiu — foi para a seção 2 do "Definir o palco",
            junto do que ele descreve: de onde sai cada janela. Aqui em cima
            fica a decisão que se repete a cada trecho. */}
        {/* D-594: os PADRÕES do corte num bloco só — o palco e o gancho, cada
            um com escolher, editar e criar. São as duas decisões que valem
            para todos os trechos, e o operador as procura no mesmo lugar. */}
        <p className="font-code text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          padrões do corte
        </p>
        <PalcoPadraoDoCorte
          corteId={corteId}
          podeEditar={shorts.length > 0}
          onEditar={onEditarPalcoPadrao}
        />
        <GanchoPadraoDoCorte corteId={corteId} onEditar={onEditarGanchoPadrao} />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wb-border-soft)] pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCriarManual}
            disabled={criarManual.isPending || duracaoRegua <= 0}
          >
            <Plus />
            Novo trecho em {mmss(tempoAtual)}
          </Button>

          {/* D-604: o gesto que a demanda pediu — marcar onde o player está e
              dizer A QUAL short aquilo pertence.
              Fica AQUI, e não no card, porque a pergunta é "de quem é este
              pedaço?": no card ele já estaria respondido pelo card em que o
              operador clicou, e ele teria de abrir o trecho certo antes de
              marcar. Aqui o fluxo é o dele — para o player, marca, escolhe. */}
          {shorts.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--wb-text-mute)]">
              somar este instante a
              <select
                aria-label="Somar este instante como segmento de qual trecho"
                value=""
                disabled={edicao.ocupado || duracaoRegua <= 0}
                onChange={(e) => {
                  const alvo = shorts.find((s) => s.id === e.target.value);
                  if (!alvo) return;
                  const janela = janelaNova(tempoAtual, duracaoRegua);
                  edicao.gravar(alvo.id, {
                    segmentos: comSegmentoNovo(alvo, janela.inicio, janela.fim),
                  });
                  // O trecho que recebeu o pedaço entra em foco e abre os
                  // ajustes: é lá que a lista de segmentos vive, e quem acabou de
                  // somar um vai querer conferir a ordem.
                  onSelecionar(alvo.id);
                  setAjusteAberto(alvo.id);
                }}
                className="h-7 max-w-[190px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
              >
                <option value="">escolher o trecho…</option>
                {shorts.map((candidato, indice) => (
                  <option key={candidato.id} value={candidato.id}>
                    {indice + 1}. {resumo(candidato)}
                    {efetivos(candidato).length >= MAX_SEGMENTOS ? ' (cheio)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {criarManual.isError && (
            <span className="text-[11px] text-[var(--wb-warn-ink)]">
              {(criarManual.error as Error)?.message ?? 'não consegui criar'}
            </span>
          )}
        </div>
      </div>

      {carregando && (
        <p className="py-8 text-center text-[13px] text-[var(--wb-text-mute)]">
          Carregando candidatos…
        </p>
      )}

      {/* Falha de rede NÃO pode se parecer com "não há candidatos": a
          primeira pede para tentar de novo, a segunda pede para gerar. */}
      {falhou && (
        <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-dim)]">
          Não consegui carregar os candidatos:{' '}
          {(erroDaLista as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}

      {!carregando && !falhou && shorts.length === 0 && (
        <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
          Nenhum candidato ainda. Gere o bruto de novo para a IA propor os trechos, ou marque
          um trecho à mão.
        </p>
      )}

      {shorts.map((short) => (
        <CandidatoCard
          key={short.id}
          short={short}
          corteId={corteId}
          emFoco={emFocoId === short.id}
          ocupado={ocupado}
          aberto={ajusteAberto === short.id}
          onAlternarAjuste={() =>
            setAjusteAberto((atual) => (atual === short.id ? null : short.id))
          }
          onSelecionar={() => onSelecionar(short.id)}
          onTocar={() => onTocar(short)}
          onStatus={(status) => edicao.gravar(short.id, { status })}
          onBorda={(campo) => onBorda(short, campo)}
          onEnquadrarPeloRosto={() => enquadrarPeloRosto.mutate(short.id)}
          enquadrando={enquadrarPeloRosto.isPending && enquadrarPeloRosto.variables === short.id}
          vereditoDoRosto={
            enquadrarPeloRosto.data && enquadrarPeloRosto.variables === short.id
              ? textoDoVeredito(enquadrarPeloRosto.data)
              : ''
          }
          // D-552: aplicar um palco copia os valores E marca a origem, para
          // o select poder dizer qual preset descreve este trecho.
          onPalco={(presetId, payload) =>
            edicao.gravar(short.id, mudancaDoPalco(presetId, payload))
          }
          onSeguirPadrao={() => edicao.gravar(short.id, SEGUIR_O_PALCO_PADRAO)}
          onDefinirPalco={() => onDefinirPalco(short.id)}
          onEscreverGancho={() => onEscreverGancho(short.id)}
          onPrevia={() => previa.mutate(short.id)}
          onRenderizar={() => renderizar.mutate(short.id)}
          // D-604: a colagem passa pelo MESMO caminho de escrita dos outros
          // campos. Um PATCH proprio para os segmentos teria de repetir o
          // otimismo, o rollback e o "ocupado" que `edicao` ja resolve.
          onSegmentos={(segmentos) => edicao.gravar(short.id, { segmentos })}
          tempoAtualSeg={tempoAtual}
          duracaoBrutoSeg={duracaoRegua}
          onIr={onIr}
        />
      ))}

      {edicao.erro && (
        <p className="rounded-[9px] bg-[var(--wb-bg-inset)] p-2 text-[12px] text-[var(--wb-text-dim)]">
          {edicao.erro}
        </p>
      )}

      {/* Falha de DISPARO (ex.: já há render em andamento). A falha do render
          em si chega pelo progresso, no card. */}
      {(previa.isError || renderizar.isError) && (
        <p className="rounded-[9px] border border-[var(--wb-warn-ink)] bg-[var(--wb-warn-soft)] p-2 text-[12px] leading-relaxed text-[var(--wb-warn-ink)]">
          <span className="font-bold">Não consegui iniciar.</span>{' '}
          {((previa.error ?? renderizar.error) as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}
    </aside>
  );
}
