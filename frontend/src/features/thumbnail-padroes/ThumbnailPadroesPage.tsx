// D-070 / D-1176 (DIRECAO §7.8, §7.13): tela global de "Padrões dos melhores prompts de thumbnail". Dispara o
// agente que lê as avaliações melhor pontuadas (D-066), mostra o que os melhores
// têm em comum (por eixo) e a proposta de ajuste para a skill do Capista, para o
// o operador validar antes da edição manual da SKILL.md.
import { useMutation } from '@tanstack/react-query';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { useToast } from '@/components/ui/toaster';
import { padroesThumbnailApi, type PadroesThumbnailResponse } from './api';
import { providerEmVoo, type ProviderIA } from '@/lib/providerIa';
import { eixosComOcorrencias, rotuloEixo } from './thumbnailPadroes';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';

const TOM_DA_FORCA: Record<string, TomDoSelo> = {
  alta: 'ok',
  media: 'convite',
  baixa: 'inerte',
};

type Resultado = PadroesThumbnailResponse;
type Analise = NonNullable<Resultado['analise']>;

function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">{children}</div>;
}

export function TabelaDePadroes({ padroes }: { padroes: Analise['padroes'] }) {
  return (
    <Moldura>
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>Eixo</TabelaTitulo>
            <TabelaTitulo>Padrão</TabelaTitulo>
            <TabelaTitulo>Força</TabelaTitulo>
            <TabelaTitulo>Evidência</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          {padroes.map((padrao, indice) => (
            <TabelaLinha key={`${padrao.eixo}-${indice}`}>
              <TabelaCelula className="whitespace-nowrap py-3 align-top text-fg-2">{rotuloEixo(padrao.eixo)}</TabelaCelula>
              <TabelaCelula className="py-3 align-top font-semibold">{padrao.padrao}</TabelaCelula>
              <TabelaCelula className="py-3 align-top">
                <Selo tom={TOM_DA_FORCA[padrao.forca] ?? 'inerte'}>{padrao.forca}</Selo>
              </TabelaCelula>
              <TabelaCelula className="py-3 align-top text-fg-2">{padrao.evidencia || '—'}</TabelaCelula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </Moldura>
  );
}

export function TabelaDeFrequencia({ eixos }: { eixos: ReturnType<typeof eixosComOcorrencias> }) {
  return (
    <Moldura>
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>Eixo</TabelaTitulo>
            <TabelaTitulo>Ocorrências</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          {eixos.map(({ eixo, rotulo, ocorrencias }) => (
            <TabelaLinha key={eixo}>
              <TabelaCelula className="whitespace-nowrap py-3 align-top text-fg-2">{rotulo}</TabelaCelula>
              <TabelaCelula className="py-3">
                <div className="flex flex-wrap gap-1.5">
                  {ocorrencias.map((ocorrencia) => (
                    <Selo key={ocorrencia.valor} tom="neutro">
                      {ocorrencia.valor}
                      {ocorrencia.contagem > 1 && <span className="num text-fg-3">×{ocorrencia.contagem}</span>}
                    </Selo>
                  ))}
                </div>
              </TabelaCelula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </Moldura>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="text-linha text-fg">{titulo}</h2>
      {children}
    </section>
  );
}

export function ThumbnailPadroesPage() {
  const { notify } = useToast();

  const analise = useMutation<PadroesThumbnailResponse, Error, ProviderIA>({
    mutationFn: (provider: ProviderIA) => padroesThumbnailApi.analisar(provider),
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
          icone: 'brain',
          texto: 'Analisar padrões',
          forte: true,
          ia: { emVoo, onGerar: (provider) => analise.mutate(provider) },
        },
      ],
    },
    [emVoo, resultado, eixos.length],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto px-7 py-6 text-fg">
      {!resultado && !analise.isPending && (
        <EstadoVazio
          icone="brain"
          titulo="Nenhuma análise ainda"
          descricao="Use “Analisar padrões” no topo para extrair o que as capas melhor avaliadas têm em comum."
        />
      )}

      {analise.isPending && <EstadoCarregando frase="Analisando os melhores prompts…" linhas={2} />}

      {insuficiente && (
        <EstadoVazio
          icone="image-off"
          titulo="Ainda não há avaliações boas suficientes"
          descricao={`Foram encontradas ${resultado?.total_melhores ?? 0} capas bem avaliadas (mínimo de ${resultado?.minimo ?? 3}). Avalie mais capas como “Ótimo/Bom” e tente de novo.`}
        />
      )}

      {resultado?.status === 'ok' && resultado.analise && (
        <>
          <Secao titulo={`Resumo · ${resultado.total_melhores} melhores de ${resultado.total_avaliacoes}`}>
            <p className="max-w-[72ch] text-corpo text-fg-2">{resultado.analise.resumo}</p>
          </Secao>

          <Secao titulo="Padrões identificados">
            <TabelaDePadroes padroes={resultado.analise.padroes} />
          </Secao>

          <section className="grid gap-2 rounded-cartao border border-iris-fio bg-iris-suave p-5">
            <h2 className="text-linha text-fg">Proposta de ajuste na skill do Capista</h2>
            <p className="whitespace-pre-wrap text-corpo text-fg">{resultado.analise.proposta_ajuste_skill}</p>
            <p className="text-pequeno text-fg-2">
              A edição da SKILL.md é manual e só acontece depois que você validar estes padrões.
            </p>
          </section>

          {eixos.length > 0 && (
            <Secao titulo={`Frequência por eixo · dados brutos · ${resultado.com_tags ?? 0} com tags`}>
              <TabelaDeFrequencia eixos={eixos} />
            </Secao>
          )}
        </>
      )}
    </div>
  );
}
