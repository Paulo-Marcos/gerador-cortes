import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Corte } from '@/types/models';
import { COR_DO_SELO } from '@/upgrade/SeloDeEstado';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MudancasDoCorte, useDiffDoCorte } from './MudancasDoCorte';
import { NOTA_MAXIMA, lerNotaDoCorte, type NotaDoCorte } from './notaDoCorte';

// ─────────────────────────────────────────────────────────────────
// D-886 · "Por que este corte?"
//
// O operador assiste um corte, acha fraco e quer saber o que a IA viu nele.
// A resposta já estava gravada desde a análise — a `justificativa` (I-034) e
// o `score` (D-302) —, mas só a auditoria da análise inteira a mostrava.
// Aqui ela vem do corte, em quatro blocos curtos: a nota, o porquê, o gancho
// e o tema. Embaixo, o que o operador mudou na proposta (D-999), que é a
// outra metade da comparação: o quão longe a IA ficou do corte que saiu.
// ─────────────────────────────────────────────────────────────────

export function PorQueDoCorteModal({ corte, aoFechar }: { corte: Corte; aoFechar: () => void }) {
  const nota = lerNotaDoCorte(corte.score);
  const diff = useDiffDoCorte(corte);
  // Portal para a `.ap`: a barra de ações, onde o selo mora, pode virar a referência do
  // `position: fixed` e prender o diálogo dentro dela. O `Dialog` desenha no lugar.
  const alvo = document.querySelector('.ap') ?? document.body;
  // D-1150 (E-069 H-17): o `Dialog` da Sala no lugar do `UpgradeModal` — foco preso e
  // devolvido, Esc fecha, sem `backdrop-filter` (o editor toca vídeo, DIRECAO §3.6).
  // Consulta, não decisão: só o "Fechar", sem primária.
  return createPortal(
    <Dialog
      open
      onClose={aoFechar}
      tamanho="md"
      title={`Por que a IA escolheu o corte #${corte.numero}`}
      description={corte.titulo_proposto}
      footer={
        <Button variant="secundario" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <ConteudoDoPorQue corte={corte} nota={nota} />
        <MudancasDoCorte diff={diff} />
      </div>
    </Dialog>,
    alvo,
  );
}

export function ConteudoDoPorQue({ corte, nota }: { corte: Corte; nota: NotaDoCorte | null }) {
  const justificativa = corte.justificativa?.trim();
  const gancho = corte.frase_gancho_texto?.trim();
  if (!nota && !justificativa && !gancho) {
    return (
      <p className="text-corpo text-fg-2">
        A IA não deixou justificativa nem nota para este corte — ele foi criado à mão ou veio de
        uma análise anterior a esses campos.
      </p>
    );
  }
  return (
    <>
      {nota ? <BlocoDaNota nota={nota} /> : null}
      {justificativa ? <Bloco titulo="Por que virou corte">{justificativa}</Bloco> : null}
      {gancho ? (
        <Bloco titulo={`Frase-gancho${corte.frase_gancho_hms ? ` · ${corte.frase_gancho_hms}` : ''}`}>
          “{gancho}”
        </Bloco>
      ) : null}
      {corte.tema_central?.trim() ? <Bloco titulo="Tema">{corte.tema_central}</Bloco> : null}
    </>
  );
}

// A cor da nota é a do selo do tom (a mesma do "IA 21/30" na barra), por variável.
function BlocoDaNota({ nota }: { nota: NotaDoCorte }) {
  const cor = { '--cor': COR_DO_SELO[nota.tom].cor } as CSSProperties;
  return (
    <section className="flex flex-col gap-2" style={cor}>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-titulo text-[color:var(--cor)]">{nota.total}</span>
        <span className="font-mono text-pequeno text-fg-2">de {NOTA_MAXIMA} · nota da IA</span>
      </span>
      {nota.partes.map((p) => (
        <span key={p.rotulo} title={p.pergunta} className="grid grid-cols-[56px_1fr_22px] items-center gap-2">
          <span className="text-pequeno text-fg-2">{p.rotulo}</span>
          <span className="h-1.5 overflow-hidden rounded-pilula bg-poco">
            {/* A largura é geometria de execução: entra por variável (DIRECAO §9.3). */}
            <span
              className="block h-full w-[var(--width)] bg-[var(--cor)]"
              style={{ '--width': `${Math.min(100, Math.max(0, p.valor * 10))}%` } as CSSProperties}
            />
          </span>
          <span className="text-right font-mono text-pequeno">{p.valor}</span>
        </span>
      ))}
      <span className="text-micro text-fg-3">
        Ranking entre os cortes desta live, não nota absoluta de qualidade.
      </span>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <span className="text-micro text-fg-2">{titulo}</span>
      <p className="text-corpo text-fg">{children}</p>
    </section>
  );
}
