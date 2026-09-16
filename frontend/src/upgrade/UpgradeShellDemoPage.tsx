import { useMemo, useState } from 'react';
import { KitScreen } from './KitScreen';
import { UpgradeShell } from './UpgradeShell';
import { useDefinirChrome, type SeletorItem } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 1 · vitrine da casca.
//
// A casca só se prova com dados: sem lista, a coluna de contexto não
// existe; sem cortes, o seletor não tem o que trocar. Esta página
// alimenta a casca com a LIVE 267 do protótipo — os mesmos seis
// cortes, os mesmos estados — para que dê para comparar com o
// .dc.html lado a lado e testar J/K, ⌘B e a barra de ações de fato.
//
// Ela é vitrine, não produção: nenhuma tela real depende dela, e ela
// sai do repositório quando a última tela estiver migrada.
// ─────────────────────────────────────────────────────────────────

const OK = 'var(--ok)';
const A2 = 'var(--accent2)';
const I = 'var(--info)';
const M = 'var(--mute)';

const TOM: Record<string, { cor: string; bg: string }> = {
  pronto: { cor: OK, bg: 'var(--ok-soft)' },
  aprovado: { cor: A2, bg: 'var(--accent-soft)' },
  proposto: { cor: I, bg: 'var(--info-soft)' },
  publicado: { cor: OK, bg: 'var(--ok-soft)' },
  rejeitado: { cor: M, bg: 'var(--inset)' },
};

const CORTES = [
  { num: 7, titulo: 'O erro do BC em 40 segundos', dur: '0:46', inicio: '04:12', fim: '04:58', status: 'pronto', fire: true },
  { num: 8, titulo: 'Selic e o seu aluguel', dur: '0:45', inicio: '09:30', fim: '10:15', status: 'aprovado', fire: true },
  { num: 9, titulo: 'Quem lucra com juros altos', dur: '0:38', inicio: '13:02', fim: '13:40', status: 'proposto', fire: false },
  { num: 10, titulo: 'A dívida pública em 3 minutos', dur: '2:58', inicio: '21:10', fim: '24:08', status: 'publicado', fire: false },
  { num: 11, titulo: 'Resposta ao inscrito sobre FIIs', dur: '1:12', inicio: '31:44', fim: '32:56', status: 'aprovado', fire: true },
  { num: 12, titulo: 'Aparte sobre o jogo de ontem', dur: '0:22', inicio: '38:02', fim: '38:24', status: 'rejeitado', fire: false },
];

function DemoConteudo() {
  const [corte, setCorte] = useState(7);
  const atual = CORTES.find((c) => c.num === corte) ?? CORTES[0];

  const passo = useMemo(
    () => (delta: number) => {
      const i = CORTES.findIndex((c) => c.num === corte);
      setCorte(CORTES[(i + delta + CORTES.length) % CORTES.length].num);
    },
    [corte],
  );

  const itensSeletor: SeletorItem[] = CORTES.map((c) => ({
    id: String(c.num),
    num: String(c.num),
    titulo: c.titulo,
    dur: c.dur,
    inicio: c.inicio,
    fim: c.fim,
    status: c.status,
    statusBg: TOM[c.status].bg,
    statusCor: TOM[c.status].cor,
    fire: c.fire,
    ativo: c.num === corte,
    onClick: () => setCorte(c.num),
  }));

  useDefinirChrome(
    {
      titulo: `Corte #${atual.num} — ${atual.titulo}`,
      sub: 'bruto 18:32 · trecho 46s · 4 candidatos da IA',
      rotulos: ['LIVE 267', `#${atual.num}`],
      acoes: [
        { icone: 'flame', texto: 'Marcar fire' },
        { icone: 'sparkles', texto: 'Gerar trechos' },
      ],
      estado: { texto: 'salvo', icone: 'circle-check', cor: OK, bg: 'var(--ok-soft)' },
      contexto: {
        titulo: 'LIVE 267 — Juros',
        sub: 'Respondendo inscritos · 2h14',
        etapas: [
          { icone: 'download', titulo: 'Baixado', estado: 'feito' },
          { icone: 'brain', titulo: 'Analisado', estado: 'feito' },
          { icone: 'scissors', titulo: 'Cortes', estado: 'agora' },
          { icone: 'clapperboard', titulo: 'Pós', estado: 'feito' },
          { icone: 'tags', titulo: 'Metadados', estado: 'todo' },
          { icone: 'rocket', titulo: 'Publicado', estado: 'todo' },
        ],
        listaTitulo: 'Cortes da live',
        listaResumo: '14 · 8 prontos',
        acao: { texto: 'Novo corte' },
        itens: CORTES.map((c) => ({
          id: String(c.num),
          titulo: c.titulo,
          legenda: `#${c.num} · ${c.inicio}`,
          dur: c.dur,
          dot: TOM[c.status].cor,
          ativo: c.num === corte,
          onClick: () => setCorte(c.num),
        })),
      },
      seletor: {
        num: String(atual.num),
        titulo: atual.titulo,
        listaTitulo: 'Cortes da LIVE 267',
        listaResumo: '14 · 8 prontos',
        itens: itensSeletor,
        filtros: [
          { texto: 'Todos', n: 14, ativo: true },
          { texto: 'Fire', n: 3 },
          { texto: 'Prontos', n: 8 },
          { texto: 'A decidir', n: 3 },
        ],
        onAnterior: () => passo(-1),
        onProximo: () => passo(1),
        onVerTodos: () => undefined,
      },
      barra: {
        teclas: [
          { teclas: ['J', 'K'], texto: 'trocar de corte' },
          { teclas: ['Space'], texto: 'tocar' },
        ],
        secundario: { texto: 'Rejeitar', icone: 'x' },
        terciario: { titulo: 'Prévia', icone: 'eye' },
        primario: { texto: 'Aprovar corte', icone: 'check' },
      },
    },
    [corte],
  );

  return <KitScreen />;
}

export default function UpgradeShellDemoPage() {
  return (
    <UpgradeShell
      fila={{ titulo: 'Fila · 1 job', sub: 'render 62% · 4 min', progresso: 62, to: '/upgrade/shell' }}
    >
      <DemoConteudo />
    </UpgradeShell>
  );
}
