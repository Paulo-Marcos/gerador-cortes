import type { ProviderIA } from '@/lib/providerIa';

// D-977: a análise da live com as duas IAs, uma depois da outra.
//
// A análise é aditiva (D-298): os cortes do Gemini somam aos do Claude, e um
// corte que começa quase no mesmo ponto de um já criado é pulado. O operador
// fica com o melhor de cada uma e remove na avaliação o que não servir.
// Em fila, não em paralelo: as duas gravam no mesmo projeto, e a segunda
// precisa ver os cortes da primeira para pular as quase-duplicatas.

export const ORDEM_DAS_DUAS: ProviderIA[] = ['claude', 'gemini'];

const NOME: Record<ProviderIA, string> = { claude: 'Claude', gemini: 'Gemini' };

export type DesfechoDaAnalise =
  | { provider: ProviderIA; ok: true; totalCortes: number }
  | { provider: ProviderIA; ok: false; erro: string };

/**
 * Roda a análise com cada IA, em ordem. Uma que falha (cota, CLI fora do ar)
 * não impede a outra: o desfecho de cada uma volta para o aviso.
 */
export async function analisarComAsDuas(
  analisar: (provider: ProviderIA) => Promise<{ total_cortes?: number | null }>,
  aoComecar: (provider: ProviderIA) => void = () => {},
): Promise<DesfechoDaAnalise[]> {
  const desfechos: DesfechoDaAnalise[] = [];
  for (const provider of ORDEM_DAS_DUAS) {
    aoComecar(provider);
    try {
      const resposta = await analisar(provider);
      desfechos.push({ provider, ok: true, totalCortes: resposta.total_cortes ?? 0 });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : 'erro desconhecido';
      desfechos.push({ provider, ok: false, erro: motivo });
    }
  }
  return desfechos;
}

/** O aviso do fim: quantos cortes cada IA trouxe, ou por que falhou. */
export function avisoDasDuas(desfechos: DesfechoDaAnalise[]): {
  texto: string;
  tom: 'success' | 'error';
} {
  const partes = desfechos.map((d) =>
    d.ok
      ? `${NOME[d.provider]} trouxe ${d.totalCortes} corte(s)`
      : `${NOME[d.provider]} falhou (${d.erro})`,
  );
  const algumaDeuCerto = desfechos.some((d) => d.ok);
  return {
    texto: `Análise com as duas IAs: ${partes.join('; ')}.`,
    tom: algumaDeuCerto ? 'success' : 'error',
  };
}
