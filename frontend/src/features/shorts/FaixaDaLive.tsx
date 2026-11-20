// D-803 / D-1168 (DIRECAO §7.6) · A faixa de cada live: título, "N cortes na fábrica" e o clique
// que atende todos de uma vez ("Gerar shorts com IA", secundária pequena).
//
// O botão da live age sobre a live inteira; por isso os números vêm de `agrupamentoPorLive`
// (que ignora o filtro) e não mudam quando o operador troca de chip.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { aoDispararLive } from './aposGerarShorts';
import type { GrupoDaLive } from './agrupamentoPorLive';
import { motivoDoErro, shortsApi, type AndamentoDaLive } from './shortsApi';
import { estaRodando } from './useFires';

export function FaixaDaLive({ grupo, andamento }: { grupo: GrupoDaLive; andamento?: AndamentoDaLive }) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState('');
  const rodando = andamento ? estaRodando(andamento) : false;

  const disparar = useMutation({
    mutationFn: () => shortsApi.gerarDaLive(grupo.projetoId),
    onSuccess: () => {
      setErro('');
      void aoDispararLive(queryClient);
    },
    onError: (e) => setErro(motivoDoErro(e, 'Não consegui disparar a live.')),
  });

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-fio px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-linha text-fg" title={grupo.titulo}>
          {grupo.titulo || 'live sem título'}
        </h2>
        <p className="num text-fg-3">
          {grupo.totalDaLive} {grupo.totalDaLive === 1 ? 'corte' : 'cortes'} na fábrica
          {grupo.pendentes > 0 && ` · ${grupo.pendentes} sem bruto ou sem short`}
          {grupo.precisaBaixar && ' · live limpa do disco'}
        </p>
        {/* A falha de um corte não para a live; ela aparece aqui, com o nome dele. */}
        {andamento?.erros.map((motivo) => (
          <p key={motivo} className="text-micro text-aviso">
            {motivo}
          </p>
        ))}
        {erro && <p className="text-micro text-aviso">{erro}</p>}
      </div>

      {rodando && andamento ? (
        <span className="inline-flex items-center gap-1.5 text-pequeno text-info">
          <Icon name="loader-2" className="animate-spin motion-reduce:animate-none" />
          {andamento.etapa === 'baixando'
            ? 'Baixando a live…'
            : `Gerando ${Math.min(andamento.feitos + 1, andamento.total)} de ${andamento.total}…`}
        </span>
      ) : grupo.pendentes > 0 ? (
        <Button
          variant="secundario"
          size="pq"
          carregando={disparar.isPending}
          onClick={() => disparar.mutate()}
          title="Um corte por vez: refaz o bruto que falta e a IA propõe os trechos. Nada do que já existe é apagado."
        >
          <Icon name={grupo.precisaBaixar ? 'download' : ICONE_DO_CONCEITO.iaGera} />
          {grupo.precisaBaixar
            ? `Baixar a live e gerar (${grupo.pendentes})`
            : grupo.pendentes === 1
              ? 'Gerar o que falta'
              : `Gerar os ${grupo.pendentes} que faltam`}
        </Button>
      ) : null}
    </header>
  );
}
