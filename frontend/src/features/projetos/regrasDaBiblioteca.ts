import type { CorteDoMapa } from '@/components/ui/mapa-da-live';
import { rotuloDoDia, type DiaDaRegua } from '@/components/ui/regua-de-dias';
import { sortProjetosPorPublicacao } from '@/features/projetos/bibliotecaFiltros';
import { estadoDoProjeto, ROTULO_DO_SELO, TOM_DO_ESTADO } from '@/features/projetos/statusMaps';
import { estaProntoPraYoutube } from '@/features/projetos/useProjetos';
import { estaAprovado } from '@/lib/statusDoCorte';
import { thumbnailUrl } from '@/lib/utils';
import type { Corte, Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-1148 (E-069 H-15; DIRECAO §7.1 e §11) · As regras da Biblioteca, sem React.
//
// Tudo sai da listagem de projetos que a tela já carrega (§11: "lives por dia"
// e "contagens do estado da casa" não pedem endpoint novo). Aqui moram a
// saudação, a frase do estado da casa, os oito dias da régua e as duas colunas.
// ─────────────────────────────────────────────────────────────────

/** "Boa noite, Paulo." — só o primeiro nome, no feixe. Sem nome, "Boa noite." (§11). */
export function saudacao(hora: number, nome: string): string {
  const periodo = hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiro = nome.trim().split(/\s+/)[0];
  return primeiro ? `${periodo}, ${primeiro}.` : `${periodo}.`;
}

const EM_CURSO = new Set(['aguardando', 'baixando', 'transcrevendo', 'analise']);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A segunda linha da saudação: o que a casa pede agora, com número (nunca decorativa). */
export function estadoDaCasa(projetos: Projeto[]): string {
  if (projetos.length === 0) return 'A sala está pronta. Falta a primeira live.';
  const estados = projetos.map((p) => ({ p, e: estadoDoProjeto(p).key }));
  const esperamOk = estados
    .filter(({ e }) => e === 'analisado')
    .reduce((soma, { p }) => soma + p.total_cortes, 0);
  if (esperamOk > 0) return `${plural(esperamOk, 'corte espera', 'cortes esperam')} o seu ok.`;
  const prontas = estados.filter(({ e }) => e === 'pronto-publicar').length;
  if (prontas > 0) return `${plural(prontas, 'live está pronta', 'lives estão prontas')} para publicar.`;
  const emCurso = estados.filter(({ e }) => EM_CURSO.has(e)).length;
  if (emCurso > 0) return `${plural(emCurso, 'live está', 'lives estão')} a caminho.`;
  const pendentes = projetos.filter((p) => !estaProntoPraYoutube(p)).length;
  if (pendentes > 0) return `${plural(pendentes, 'live espera', 'lives esperam')} você.`;
  return 'Tudo no ar.';
}

/** `AAAA-MM-DD` da data da live (`20260701`, `20260701153000` ou ISO). Vazio se não lê. */
export function diaDaLive(dataLive: string): string {
  const v = (dataLive || '').trim();
  const compacta = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (compacta) return `${compacta[1]}-${compacta[2]}-${compacta[3]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return iso ? iso[1] : '';
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const diaLocal = (d: Date) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

/** O cabeçalho da tela: "Boa noite, Paulo." e "sex, 20 de nov · 6 cortes esperam o seu ok.". */
export function cabecalhoDaBiblioteca(agora: Date, nome: string, projetos: Projeto[] | undefined) {
  const hoje = rotuloDoDia(diaLocal(agora)).completo;
  return {
    titulo: saudacao(agora.getHours(), nome),
    sub: projetos ? `${hoje} · ${estadoDaCasa(projetos)}` : hoje,
  };
}

/** "Os últimos 8 dias": de 7 dias atrás até hoje, cada dia com as lives dele. */
export function diasDaRegua(projetos: Projeto[], hoje: Date, quantos = 8): DiaDaRegua[] {
  const porDia = new Map<string, Projeto[]>();
  for (const p of projetos) {
    const dia = diaDaLive(p.data_live);
    if (dia) porDia.set(dia, [...(porDia.get(dia) ?? []), p]);
  }
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (quantos - 1 - i));
    const data = diaLocal(d);
    return {
      data,
      hoje: i === quantos - 1,
      lives: (porDia.get(data) ?? []).map((p) => {
        const estado = estadoDoProjeto(p).key;
        return {
          id: p.id,
          titulo: p.titulo_live || 'Sem título',
          href: `/projetos/${p.id}`,
          capa: thumbnailUrl(p.youtube_url, 'mq') ?? undefined,
          tom: TOM_DO_ESTADO[estado],
          estado: ROTULO_DO_SELO[estado],
        };
      }),
    };
  });
}

/** "Esperando você": as que não estão todas no ar, menos a do destaque. */
export function esperandoVoce(projetos: Projeto[], destaqueId: string | undefined, limite = 4): Projeto[] {
  return projetos
    .filter((p) => p.id !== destaqueId && !estaProntoPraYoutube(p))
    .sort(sortProjetosPorPublicacao)
    .slice(0, limite);
}

/** "No ar há pouco": as publicadas inteiras, da mais recente para trás. */
export function noArHaPouco(projetos: Projeto[], limite = 4): Projeto[] {
  return projetos.filter(estaProntoPraYoutube).sort(sortProjetosPorPublicacao).slice(0, limite);
}

/** Os cortes no mini-mapa do "Continue": aprovado aceso, rejeitado riscado (§3.3). */
export function cortesDoMapa(cortes: Corte[], projetoId: string): CorteDoMapa[] {
  return cortes.map((c) => ({
    id: c.id,
    numero: c.numero,
    nome: c.titulo_proposto || c.tema_central,
    inicioSeg: c.inicio_seg,
    fimSeg: c.fim_seg,
    estado: c.status === 'rejeitado' ? 'riscado' : estaAprovado(c.status) ? 'pronto' : 'proposto',
    href: `/projetos/${projetoId}/cortes/${c.id}`,
  }));
}

/** O motivo do erro em palavras do operador: a falha de rede chega como "Failed to fetch". */
export function motivoDoErro(erro: unknown): string {
  if (erro instanceof TypeError) return 'O app não conseguiu falar com o backend. Confira se ele está rodando.';
  return erro instanceof Error && erro.message ? erro.message : 'A lista de lives não chegou.';
}
