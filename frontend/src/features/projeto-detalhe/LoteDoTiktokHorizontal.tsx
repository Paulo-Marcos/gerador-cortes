import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportStatusKey } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { PainelDoLote } from '@/features/shorts/PublicarEmLoteModal';
import { motivoDoErro, shortsApi, type EnvioAssistido } from '@/features/shorts/shortsApi';
import { useCancelarLote, useCriarLote, useLoteAtual } from '@/features/shorts/useLotePublicacao';
import type { StatusExportCorte } from '@/types/models';
import { alvosDoLoteNoTiktok } from './listasDePublicacao';
import { Icon } from '@/upgrade/Icon';

// D-799: o "subir todos" dos cortes no TikTok.
//
// ## O robô em lote, e não um botão por linha
//
// O operador clicava "Assistido" em cada corte e ficava de babá: um upload por
// vez, olhando o Chrome para ele não travar. Agora o lote do backend (o mesmo
// dos shorts, D-564) sobe todos em sequência, com o Chrome fora da tela, sem
// esperar a publicação de um para começar o próximo. No fim a janela volta, com
// uma aba pronta por corte, e ele só passa clicando Publicar.
//
// Com "publicar sozinho", nem isso — e mesmo assim o robô não publica um corte
// cuja capa não entrou (RN-26): esse fica esperando, com o motivo na linha.
//
// ## O "Preparar pacotes" continua ao lado
//
// Ele não depende da página do TikTok. No dia em que o Studio redesenhar e o
// robô quebrar, é o caminho que segue funcionando.

const PLATAFORMA = 'tiktok_horizontal';

interface Props {
  projetoId: string;
  pendentes: StatusExportCorte[];
  /** D-834: data e "publicar sozinho" vêm do modal, que vale também para cada corte. */
  envio: EnvioAssistido;
  onPreparado: (corteId: string) => void;
}

export function LoteDoTiktokHorizontal({ projetoId, pendentes, envio, onPreparado }: Props) {
  const [quantidade, setQuantidade] = useState(0);
  const alvos = alvosDoLoteNoTiktok(pendentes, quantidade);

  const subir = useCriarLote();
  const cancelar = useCancelarLote();
  const raia = useRaiaDoTiktokHorizontal(projetoId);
  const correndo = Boolean(raia && !raia.terminou);

  const preparar = useMutation({
    mutationFn: async () => {
      // Em série: numa rajada, a chamada que falha não diz qual corte ficou
      // sem pasta. `abrir_pasta: false` — no lote ninguém quer dez exploradores.
      for (const corte of pendentes.slice(0, alvos.length)) {
        await shortsApi.stagingTiktokHorizontal(corte.corte_id, { abrirPasta: false });
        onPreparado(corte.corte_id);
      }
    },
  });

  function subirTodos() {
    subir.mutate({
      alvos,
      plataformas: [PLATAFORMA],
      opcoes: {
        tiktokAssistido: true,
        instagramAssistido: false,
        ...envio,
        republicar: false,
      },
    });
  }

  return (
    <div className="space-y-2 rounded-[9px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <CampoQuantos total={pendentes.length} valor={quantidade} onChange={setQuantidade} />
        <Button
          size="sm"
          disabled={subir.isPending || correndo || alvos.length === 0}
          onClick={subirTodos}
          title="O robô sobe um por um no navegador dele, fora da tela, com legenda e capa. No fim a janela volta com as abas prontas."
        >
          {subir.isPending || correndo ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="bot" />}
          {correndo ? 'subindo…' : `Subir todos (${alvos.length})`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={preparar.isPending || alvos.length === 0}
          onClick={() => preparar.mutate()}
          title="Só monta as pastas, sem abrir nada. Caminho de reserva se o robô quebrar."
        >
          {preparar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="package" />}
          {preparar.isPending ? 'montando…' : 'Só preparar pacotes'}
        </Button>
        {correndo && (
          <Button
            variant="ghost"
            size="sm"
            disabled={cancelar.isPending}
            onClick={() => cancelar.mutate()}
          >
            <Icon name="x-circle" />
            Cancelar
          </Button>
        )}
      </div>

      {(subir.isError || preparar.isError) && (
        <p className="text-[11px] text-[var(--wb-warn-ink)]">
          {motivoDoErro(subir.error ?? preparar.error, 'não consegui começar o lote')}
        </p>
      )}

      {raia && <PainelDoLote raias={[raia]} />}
    </div>
  );
}

/** Quantos cortes o lote leva. Vazio quer dizer todos — o caso comum. */
function CampoQuantos({
  total,
  valor,
  onChange,
}: {
  total: number;
  valor: number;
  onChange: (valor: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px]">
      Quantos
      <Input
        type="number"
        min={1}
        max={total}
        value={valor || ''}
        placeholder={String(total)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-7 w-[68px] text-center text-[12px]"
        aria-label="Quantos cortes subir"
      />
      de {total}
    </label>
  );
}

/**
 * A raia do TikTok horizontal no lote atual, se houver — e a tela do projeto
 * atualizada conforme os cortes vão sendo publicados.
 */
function useRaiaDoTiktokHorizontal(projetoId: string) {
  const { data } = useLoteAtual();
  const lote = data?.lote;
  const raia = useMemo(
    () => lote?.raias.find((r) => r.plataforma === PLATAFORMA),
    [lote],
  );
  const publicados = raia?.itens.filter((i) => i.estado === 'publicado').length ?? 0;

  const cliente = useQueryClient();
  useEffect(() => {
    // A linha de cada corte lê `tiktok_publicado_em` do status de exportação;
    // sem isto ela seguiria "pendente" com o corte já no ar.
    if (publicados > 0) void cliente.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
  }, [publicados, cliente, projetoId]);

  return raia ? { ...raia, terminou: Boolean(lote?.terminou) } : undefined;
}
