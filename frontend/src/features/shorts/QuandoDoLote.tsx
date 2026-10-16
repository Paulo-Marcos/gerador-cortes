// D-908: a seção "Quando" do lote — três respostas, e não um interruptor.
//
// "Agora" e "uma data para tudo" são o que o modal já tinha (D-580). A terceira,
// "distribuir pela janela do canal", é a que esta demanda traz: a agenda vem
// calculada ANTES do clique, linha a linha, e o operador mexe numa linha sem
// que as outras se refaçam. Burra: recebe tudo por prop, para o teste renderizar
// a lista em HTML e provar o que ela diz.
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import {
  chaveDaLinha,
  dataLegivel,
  escalona,
  ROTULO_DA_INTENSIDADE,
  resumoDaAgenda,
  type ModoDeQuando,
} from './agendaDoLote';
import { PASSO_EM_SEGUNDOS, type NotaDeAgendamento } from './agendamentoDoLote';
import type { LinhaDaAgenda } from './loteApi';
import { Caixa, rotuloCurto, Secao } from './pecasDoLote';

interface Props {
  modo: ModoDeQuando;
  onModo: (modo: ModoDeQuando) => void;
  /** A data única (modo `uma_data`). */
  agendarPara: string;
  onAgendarPara: (valor: string) => void;
  problemaDoAgendamento: string | null;
  notas: NotaDeAgendamento[];
  /** A agenda distribuída (modo `distribuir`). */
  linhas: LinhaDaAgenda[];
  carregandoAgenda: boolean;
  erroDaAgenda: string | null;
  problemasDasLinhas: Map<string, string>;
  onAjustarLinha: (chave: string, agendarPara: string) => void;
  onRecalcular: () => void;
  /** O título de cada alvo, para a linha falar de vídeos e não de uuids. */
  rotuloDoAlvo: (alvoId: string) => string;
  /** Os modos oferecidos; sem a lista, os três (D-934: o YouTube longo não tem "agora"). */
  modos?: ModoDeQuando[];
}

const MODOS: { id: ModoDeQuando; titulo: string; nota: string }[] = [
  { id: 'agora', titulo: 'Agora', nota: 'cada destino publica assim que ficar pronto' },
  { id: 'uma_data', titulo: 'Uma data para tudo', nota: 'todos os itens no mesmo instante' },
  {
    id: 'distribuir',
    titulo: 'Distribuir pela janela do canal',
    nota: 'espaça pelos blocos do canal, enche o dia e passa para o próximo',
  },
];

export function QuandoDoLote(props: Props) {
  const { modo, onModo, modos } = props;
  return (
    <Secao titulo="Quando">
      <div className="flex flex-wrap gap-2">
        {MODOS.filter((m) => !modos || modos.includes(m.id)).map((m) => (
          <Caixa
            key={m.id}
            marcada={modo === m.id}
            onClick={() => onModo(m.id)}
            titulo={m.titulo}
            nota={m.nota}
          />
        ))}
      </div>
      {modo === 'uma_data' && <DataUnica {...props} />}
      {modo === 'distribuir' && <AgendaDistribuida {...props} />}
    </Secao>
  );
}

function DataUnica({ agendarPara, onAgendarPara, problemaDoAgendamento, notas }: Props) {
  return (
    <div className="space-y-2 rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
      <Input
        type="datetime-local"
        value={agendarPara}
        /* `step` põe o seletor do navegador na mesma grade de 5 em 5 do TikTok.
           Não é validação — o backend recusa de todo jeito —, é não deixar o
           operador escolher 14:03 para depois ouvir que 14:03 não existe. */
        step={PASSO_EM_SEGUNDOS}
        onChange={(e) => onAgendarPara(e.target.value)}
        className="w-[220px]"
      />
      {problemaDoAgendamento && <Problema texto={problemaDoAgendamento} />}
      <Notas notas={notas} />
    </div>
  );
}

function Notas({ notas }: { notas: NotaDeAgendamento[] }) {
  return (
    <ul className="space-y-1">
      {notas.map((nota) => (
        <li key={nota.plataforma} className="flex gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]">
          <span
            className={nota.como === 'sozinho' ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text-mute)]'}
          >
            {nota.como === 'sozinho' ? '●' : '○'}
          </span>
          <span>
            <b className="font-medium text-[var(--wb-text)]">{nota.plataforma}</b> — {nota.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Problema({ texto }: { texto: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1 text-[11.5px] text-[var(--wb-warn-ink,var(--wb-text-dim))]"
    >
      <Icon name="triangle-alert" className="mt-px shrink-0" />
      {texto}
    </p>
  );
}

function AgendaDistribuida({
  linhas,
  carregandoAgenda,
  erroDaAgenda,
  problemasDasLinhas,
  onAjustarLinha,
  onRecalcular,
  rotuloDoAlvo,
  notas,
}: Props) {
  const resumo = resumoDaAgenda(linhas);
  return (
    <div className="space-y-2 rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--wb-text-dim)]">
        {carregandoAgenda ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="loader-2" className="animate-spin" /> calculando a agenda…
          </span>
        ) : linhas.length === 0 ? (
          <span>escolha os trechos e as redes: a agenda aparece aqui antes de você publicar</span>
        ) : (
          <span>
            {resumo.comData} com data
            {resumo.semData > 0 && <> · {resumo.semData} sem data</>}
            {resumo.noAto > 0 && <> · {resumo.noAto} no ato</>}
            {' · '}
            <span className="text-[var(--wb-text-mute)]">
              a partir do último já marcado em cada rede
            </span>
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRecalcular}
          disabled={carregandoAgenda || linhas.length === 0}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-accent)] disabled:opacity-40"
        >
          <Icon name="rotate-ccw" />
          recalcular
        </button>
      </div>
      {erroDaAgenda && <Problema texto={erroDaAgenda} />}
      {linhas.length > 0 && (
        <ul className="space-y-1" aria-label="Agenda do lote">
          {linhas.map((linha) => (
            <LinhaDoItem
              key={chaveDaLinha(linha)}
              linha={linha}
              rotulo={rotuloDoAlvo(linha.alvo_id)}
              problema={problemasDasLinhas.get(chaveDaLinha(linha)) ?? null}
              onAjustar={(valor) => onAjustarLinha(chaveDaLinha(linha), valor)}
            />
          ))}
        </ul>
      )}
      <Notas notas={notas} />
    </div>
  );
}

function LinhaDoItem({
  linha,
  rotulo,
  problema,
  onAjustar,
}: {
  linha: LinhaDaAgenda;
  rotulo: string;
  problema: string | null;
  onAjustar: (valor: string) => void;
}) {
  const editavel = escalona(linha.plataforma);
  return (
    <li
      className={cn(
        'grid items-center gap-x-2 gap-y-0.5 rounded-[7px] bg-[var(--wb-bg-panel)] px-2 py-1.5 sm:grid-cols-[1fr_auto_auto]',
        problema && 'ring-1 ring-[var(--wb-warn)]',
      )}
    >
      <span className="min-w-0 truncate text-[12px]" title={rotulo}>
        {rotulo}
        <span className="ml-1.5 text-[11px] text-[var(--wb-text-mute)]">
          → {rotuloCurto(linha.plataforma)}
        </span>
      </span>
      {editavel ? (
        <Input
          type="datetime-local"
          step={PASSO_EM_SEGUNDOS}
          aria-label={`Data de ${rotulo} no ${rotuloCurto(linha.plataforma)}`}
          value={linha.agendar_para}
          onChange={(e) => onAjustar(e.target.value)}
          className="h-7 w-[200px] text-[11.5px]"
        />
      ) : (
        <span className="text-[11px] text-[var(--wb-text-mute)]">no ato</span>
      )}
      <span className="text-[11px] text-[var(--wb-text-dim)]">
        {linha.agendar_para ? (
          <>
            {dataLegivel(linha.agendar_para)}
            {linha.intensidade && (
              <span
                className={cn(
                  'ml-1.5 rounded-[5px] px-1.5 py-0.5',
                  linha.intensidade === 'forte'
                    ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
                    : 'bg-[var(--wb-bg-inset)]',
                )}
              >
                {ROTULO_DA_INTENSIDADE[linha.intensidade] ?? linha.intensidade}
              </span>
            )}
          </>
        ) : editavel ? (
          <span className="text-[var(--wb-warn-ink,var(--wb-text-dim))]">sem data: {linha.motivo}</span>
        ) : (
          linha.motivo
        )}
      </span>
      {problema && (
        <span className="text-[11px] text-[var(--wb-warn-ink,var(--wb-text-dim))] sm:col-span-3">
          {problema}
        </span>
      )}
    </li>
  );
}
