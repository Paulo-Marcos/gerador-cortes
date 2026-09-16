// D-070: tela global de "Padrões dos melhores prompts de thumbnail". Dispara o
// agente que lê as avaliações melhor pontuadas (D-066), mostra o que os melhores
// têm em comum (por eixo) e a proposta de ajuste para a skill do Capista, para o
// Paulo validar antes da edição manual da SKILL.md.
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { useToast } from '@/components/ui/toaster';
import { api, type PadroesThumbnailResponse } from '@/lib/api';
import { providerEmVoo, type ProviderIA } from '@/lib/providerIa';
import { eixosComOcorrencias, rotuloEixo } from './thumbnailPadroes';
import { cn } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

const FORCA_TONS: Record<string, string> = {
  alta: 'text-[var(--wb-ok)]',
  media: 'text-[var(--wb-warn)]',
  baixa: 'text-[var(--wb-text-dim)]',
};

const CASCA_NOVA = isUpgradeShellEnabled();

export function ThumbnailPadroesPage() {
  const { notify } = useToast();

  const analise = useMutation<PadroesThumbnailResponse, Error, ProviderIA>({
    mutationFn: (provider: ProviderIA) => api.analisarPadroesThumbnail(provider),
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao analisar padrões.', {
        tone: 'error',
      }),
  });

  const emVoo = providerEmVoo(analise);
  const resultado = analise.data;
  const insuficiente = resultado?.status === 'dados_insuficientes';
  const eixos = eixosComOcorrencias(resultado?.padroes ?? null);

  useDefinirChrome(
    {
      // Antes da primeira análise não há o que medir: a frase explica a tela.
      sub: resultado
        ? `${resultado.total_avaliacoes} capas avaliadas · ${resultado.total_melhores} melhores · ${eixos.length} eixos com padrão`
        : 'o que as capas melhor avaliadas têm em comum — valide antes de aplicar',
      acoes: [
        {
          icone: 'wand',
          texto: 'Analisar padrões',
          forte: true,
          ia: { emVoo, onGerar: (provider) => analise.mutate(provider) },
        },
      ],
    },
    [emVoo, resultado, eixos.length],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden text-[var(--wb-text)]',
        CASCA_NOVA ? 'h-full' : 'bg-[var(--wb-bg)]',
        CASCA_NOVA || isWorkbenchEnabled() ? 'h-full' : 'h-screen',
      )}
    >
      {CASCA_NOVA ? null : (
        <header className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-4 py-2.5">
          <span className="text-[16px]" aria-hidden>
            ✨
          </span>
          <h1 className="text-[15px] font-extrabold">Padrões de thumbnail</h1>
          <span className="hidden text-xs text-[var(--wb-text-mute)] lg:block">
            o que as capas melhor avaliadas têm em comum — valide antes de aplicar
          </span>
          <div className="flex-1" />
          <AcaoDeIa
            rotulo="Analisar padrões"
            rotuloEmVoo="analisando…"
            tamanho="md"
            destaque
            emVoo={emVoo}
            onGerar={(provider) => analise.mutate(provider)}
          />
        </header>
      )}

      <main className="grid flex-1 content-start gap-5 overflow-auto p-6">
        {!resultado && !analise.isPending && (
          <p className="text-[15px] text-[var(--wb-text-mute)]">
            Clique em <strong>Analisar padrões</strong> para extrair os padrões dos melhores prompts
            avaliados.
          </p>
        )}

        {analise.isPending && (
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
            <Loader2 className="animate-spin" size={16} aria-hidden />
            Analisando os melhores prompts…
          </p>
        )}

        {insuficiente && (
          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5 text-[15px] text-[var(--wb-text-mute)]">
            Ainda não há avaliações boas suficientes para extrair padrões. Foram encontradas{' '}
            <strong>{resultado?.total_melhores ?? 0}</strong> capas bem avaliadas (mínimo de{' '}
            <strong>{resultado?.minimo ?? 3}</strong>). Avalie mais capas como “Ótimo/Bom” e tente
            de novo.
          </div>
        )}

        {resultado?.status === 'ok' && resultado.analise && (
          <>
            <section className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Resumo · {resultado.total_melhores} melhores de {resultado.total_avaliacoes}
              </h2>
              <p className="text-[15px] text-[var(--wb-text)]">{resultado.analise.resumo}</p>
            </section>

            <section className="grid gap-3">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Padrões identificados
              </h2>
              <ul className="grid gap-2">
                {resultado.analise.padroes.map((padrao, indice) => (
                  <li
                    key={`${padrao.eixo}-${indice}`}
                    className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-[var(--wb-text)]">
                        {rotuloEixo(padrao.eixo)}: {padrao.padrao}
                      </span>
                      <span
                        className={`font-code text-[10px] uppercase tracking-[0.08em] ${
                          FORCA_TONS[padrao.forca] ?? 'text-[var(--wb-text-dim)]'
                        }`}
                      >
                        {padrao.forca}
                      </span>
                    </div>
                    {padrao.evidencia && (
                      <p className="text-[13px] text-[var(--wb-text-mute)]">{padrao.evidencia}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] p-5">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-accent)]">
                Proposta de ajuste na skill do Capista
              </h2>
              <p className="whitespace-pre-wrap text-[15px] text-[var(--wb-text)]">
                {resultado.analise.proposta_ajuste_skill}
              </p>
              <p className="mt-1 text-[12px] text-[var(--wb-text-mute)]">
                A edição da SKILL.md é manual e só acontece depois que você validar estes padrões.
              </p>
            </section>

            {eixos.length > 0 && (
              <section className="grid gap-3">
                <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                  Frequência por eixo (dados brutos · {resultado.com_tags ?? 0} com tags)
                </h2>
                <ul className="grid gap-2">
                  {eixos.map(({ eixo, rotulo, ocorrencias }) => (
                    <li
                      key={eixo}
                      className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-3"
                    >
                      <span className="font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                        {rotulo}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ocorrencias.map((ocorrencia) => (
                          <span
                            key={ocorrencia.valor}
                            className="rounded-[var(--radius-sm)] border border-[var(--wb-border)] px-2 py-0.5 text-[12px] text-[var(--wb-text-mute)]"
                          >
                            {ocorrencia.valor}
                            {ocorrencia.contagem > 1 && (
                              <span className="ml-1 text-[var(--wb-text-dim)]">
                                ×{ocorrencia.contagem}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
