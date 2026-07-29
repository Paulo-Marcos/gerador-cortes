import { describe, expect, it } from 'vitest';
import {
  agruparFila,
  EXPIRACAO_TERMINAL_MS,
  jobDeRemoto,
  mesclarFila,
  migrarFilaV1,
  parseStoredQueue,
  type EstadoFila,
  type QueueJob,
} from '../useWorkbenchQueue';

// `mesclarFila` é o coração da fila: funde o inventário do backend com o que o
// operador já viu. Testado direto por ser puro (D-417).

function remoto(over: Partial<Parameters<typeof jobDeRemoto>[0]> = {}) {
  return {
    id: 'render:c1',
    tipo: 'render',
    familia: 'midia' as const,
    rotulo_tipo: 'render',
    corte_id: 'c1',
    projeto_id: 'p1',
    corte_numero: 7 as number | null,
    projeto_titulo: 'LIVE 265 — Respondendo inscritos',
    estado: 'rodando' as const,
    progresso: 42,
    etapa: 'Fase 2/4',
    erro: '',
    ...over,
  };
}

function fila(jobs: QueueJob[] = [], dispensados: string[] = []): EstadoFila {
  return { jobs, dispensados };
}

describe('jobDeRemoto', () => {
  it('monta o rótulo com o número da live, o corte e o tipo', () => {
    expect(jobDeRemoto(remoto()).rotulo).toBe('265 · corte 7 → render');
    expect(
      jobDeRemoto(remoto({ tipo: 'bruto', rotulo_tipo: 'bruto', id: 'bruto:c1' })).rotulo,
    ).toBe('265 · corte 7 → bruto');
  });

  it('omite o corte quando o job é do projeto inteiro (análise, ingestão)', () => {
    const job = jobDeRemoto(
      remoto({
        id: 'ia:cortador-expert:p1',
        tipo: 'analise',
        familia: 'ia',
        rotulo_tipo: 'análise',
        corte_id: '',
        corte_numero: null,
        etapa: 'Analisando transcrição',
      }),
    );

    expect(job.rotulo).toBe('265 → análise');
    expect(job.familia).toBe('ia');
    expect(job.corteId).toBe('');
  });

  // O backend acrescenta tipos conforme novas etapas entram na fila; a UI só
  // precisa de `familia` (cor) e `rotulo_tipo` (texto).
  it('aceita um tipo que a UI não conhece', () => {
    const job = jobDeRemoto(
      remoto({ id: 'ia:skill-nova:c1', tipo: 'skill-nova', familia: 'ia', rotulo_tipo: 'IA' }),
    );

    expect(job.tipo).toBe('skill-nova');
    expect(job.rotulo).toBe('265 · corte 7 → IA');
  });
});

describe('mesclarFila', () => {
  it('traz job novo do backend para a fila', () => {
    const resultado = mesclarFila(fila(), [remoto()]);

    expect(resultado.jobs).toHaveLength(1);
    expect(resultado.jobs[0].id).toBe('render:c1');
    expect(resultado.jobs[0].progresso).toBe(42);
  });

  it('atualiza o job existente sem duplicar', () => {
    const primeiro = mesclarFila(fila(), [remoto()]);
    const segundo = mesclarFila(primeiro, [remoto({ progresso: 88, etapa: 'Fase 4/4' })]);

    expect(segundo.jobs).toHaveLength(1);
    expect(segundo.jobs[0].progresso).toBe(88);
    expect(segundo.jobs[0].etapa).toBe('Fase 4/4');
  });

  it('congela o job quando o backend para de publicá-lo', () => {
    const rodando = mesclarFila(fila(), [remoto()]);
    const concluido = mesclarFila(rodando, [remoto({ estado: 'concluido', progresso: 100 })]);

    // Passada a retenção do backend, o item continua na fila até o operador
    // removê-lo — é essa a garantia de "fica até eu remover".
    const semBackend = mesclarFila(concluido, []);

    expect(semBackend.jobs).toHaveLength(1);
    expect(semBackend.jobs[0].estado).toBe('concluido');
  });

  it('não ressuscita job que o operador dispensou enquanto o backend o repete', () => {
    const comJob = mesclarFila(fila(), [remoto({ estado: 'concluido', progresso: 100 })]);
    const dispensado = fila([], [...comJob.dispensados, 'render:c1']);

    const resultado = mesclarFila(dispensado, [remoto({ estado: 'concluido', progresso: 100 })]);

    expect(resultado.jobs).toHaveLength(0);
    expect(resultado.dispensados).toContain('render:c1');
  });

  it('traz de volta o job dispensado que voltou a rodar', () => {
    const dispensado = fila([], ['render:c1']);

    const resultado = mesclarFila(dispensado, [remoto({ estado: 'rodando' })]);

    expect(resultado.jobs.map((job) => job.id)).toEqual(['render:c1']);
    expect(resultado.dispensados).toEqual([]);
  });

  it('esquece a dispensa quando o backend deixa de publicar o job', () => {
    const resultado = mesclarFila(fila([], ['render:c1']), []);

    expect(resultado.dispensados).toEqual([]);
  });

  it('ordena os ativos antes dos terminais', () => {
    const comTerminal = mesclarFila(fila(), [remoto({ estado: 'concluido', progresso: 100 })]);
    const resultado = mesclarFila(comTerminal, [
      remoto({ estado: 'concluido', progresso: 100 }),
      remoto({ id: 'bruto:c2', tipo: 'bruto', corte_id: 'c2', estado: 'rodando' }),
    ]);

    expect(resultado.jobs.map((job) => job.id)).toEqual(['bruto:c2', 'render:c1']);
  });

  it('devolve o mesmo objeto quando nada muda', () => {
    const primeiro = mesclarFila(fila(), [remoto()]);
    const segundo = mesclarFila(primeiro, [remoto()]);

    expect(segundo).toBe(primeiro);
  });

  it('acomoda render, IA e publicação lado a lado', () => {
    const resultado = mesclarFila(fila(), [
      remoto({ id: 'bruto:c1', tipo: 'bruto', corte_id: 'c1' }),
      remoto({ id: 'pos:c2', tipo: 'pos', corte_id: 'c2' }),
      remoto({ id: 'render:c3', tipo: 'render', corte_id: 'c3' }),
      remoto({ id: 'youtube:c4', tipo: 'youtube', familia: 'publicacao', corte_id: 'c4' }),
      remoto({ id: 'ia:cortador-expert:p1', tipo: 'analise', familia: 'ia', corte_id: '' }),
      remoto({ id: 'ia:cenas-expert:c5', tipo: 'cenas', familia: 'ia', corte_id: 'c5' }),
    ]);

    expect(resultado.jobs.map((job) => job.tipo)).toEqual([
      'bruto',
      'pos',
      'render',
      'youtube',
      'analise',
      'cenas',
    ]);
    expect(new Set(resultado.jobs.map((job) => job.familia))).toEqual(
      new Set(['midia', 'publicacao', 'ia']),
    );
  });
});

describe('persistência', () => {
  it('faz round-trip do estado salvo', () => {
    const original = mesclarFila(fila(), [remoto()]);

    expect(parseStoredQueue(JSON.stringify(original))).toEqual(original);
  });

  it('migra a fila v1 (só render, sem estado) para jobs de render rodando', () => {
    const v1 = JSON.stringify([{ corteId: 'c1', projetoId: 'p1', rotulo: '265 · corte 7 → render' }]);

    const migrado = migrarFilaV1(v1);

    expect(migrado?.jobs).toEqual([
      {
        id: 'render:c1',
        tipo: 'render',
        familia: 'midia',
        corteId: 'c1',
        projetoId: 'p1',
        alvo: '265 · corte 7 → render',
        rotuloTipo: 'render',
        rotulo: '265 · corte 7 → render',
        estado: 'rodando',
        progresso: 0,
        etapa: 'Render final',
        erro: '',
        terminalDesde: null,
      },
    ]);
  });

  // Regressão: exigir `corteId` no parse fazia o job de escopo projeto sumir da
  // fila no primeiro reload depois que o backend parava de publicá-lo — quebrando
  // a promessa de que o item fica até o operador remover.
  it('preserva job de escopo projeto ao reler do localStorage', () => {
    const salvo = mesclarFila(fila(), [
      remoto({
        id: 'ia:cortador-expert:p1',
        tipo: 'analise',
        familia: 'ia',
        rotulo_tipo: 'análise',
        corte_id: '',
        corte_numero: null,
        estado: 'concluido',
        progresso: 100,
      }),
    ]);

    const relido = parseStoredQueue(JSON.stringify(salvo));

    expect(relido?.jobs).toHaveLength(1);
    expect(relido?.jobs[0].id).toBe('ia:cortador-expert:p1');
    expect(relido?.jobs[0].rotulo).toBe('265 → análise');
  });

  it('ignora conteúdo inválido no localStorage', () => {
    expect(parseStoredQueue('não é json')).toBeNull();
    expect(parseStoredQueue(null)).toBeNull();
    expect(migrarFilaV1('{}')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// D-425 — a fila precisa mostrar o AGORA, não virar histórico.
// ─────────────────────────────────────────────────────────────

describe('expiração do job terminado', () => {
  const T0 = 1_700_000_000_000;

  it('mantém o job concluído durante a primeira hora', () => {
    const concluido = mesclarFila(fila(), [remoto({ estado: 'concluido', progresso: 100 })], T0);

    const quaseUmaHora = mesclarFila(concluido, [], T0 + EXPIRACAO_TERMINAL_MS - 1);

    expect(quaseUmaHora.jobs).toHaveLength(1);
  });

  it('some com o job concluído depois de uma hora', () => {
    const concluido = mesclarFila(fila(), [remoto({ estado: 'concluido', progresso: 100 })], T0);

    const depois = mesclarFila(concluido, [], T0 + EXPIRACAO_TERMINAL_MS);

    expect(depois.jobs).toHaveLength(0);
  });

  it('não renova o relógio a cada poll do backend', () => {
    // Regressão: carimbar de novo a cada leitura faria o job concluído nunca
    // completar a hora — a fila voltaria a crescer sem limite.
    const concluido = remoto({ estado: 'concluido', progresso: 100 });
    let estado = mesclarFila(fila(), [concluido], T0);
    for (let minuto = 1; minuto <= 59; minuto += 1) {
      estado = mesclarFila(estado, [concluido], T0 + minuto * 60_000);
    }

    expect(estado.jobs).toHaveLength(1);
    expect(mesclarFila(estado, [concluido], T0 + EXPIRACAO_TERMINAL_MS).jobs).toHaveLength(0);
  });

  it('não expira job ativo, por mais longo que seja o trabalho', () => {
    const rodando = mesclarFila(fila(), [remoto({ estado: 'rodando' })], T0);

    const muitoDepois = mesclarFila(rodando, [remoto({ estado: 'rodando' })], T0 + 5 * EXPIRACAO_TERMINAL_MS);

    expect(muitoDepois.jobs).toHaveLength(1);
  });

  it('reinicia o relógio quando o mesmo job volta a rodar', () => {
    const concluido = mesclarFila(fila(), [remoto({ estado: 'concluido', progresso: 100 })], T0);
    const rodandoDeNovo = mesclarFila(concluido, [remoto({ estado: 'rodando' })], T0 + 60_000);

    expect(rodandoDeNovo.jobs[0].terminalDesde).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// D-425 — uma linha por alvo; o detalhe fica atrás do clique.
// ─────────────────────────────────────────────────────────────

describe('agruparFila', () => {
  function job(over: Partial<QueueJob> = {}): QueueJob {
    return { ...jobDeRemoto(remoto()), ...over };
  }

  it('junta execuções do mesmo corte numa linha só', () => {
    const grupos = agruparFila([
      job({ id: 'render:c1', corteId: 'c1', rotuloTipo: 'render' }),
      job({ id: 'bruto:c1', corteId: 'c1', rotuloTipo: 'bruto' }),
      job({ id: 'render:c2', corteId: 'c2', rotuloTipo: 'render' }),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].jobs).toHaveLength(2);
    expect(grupos[0].rotulo).toBe('265 · corte 7');
    expect(grupos[1].jobs).toHaveLength(1);
  });

  it('agrupa por projeto o job que não tem corte', () => {
    const grupos = agruparFila([
      job({ id: 'ia:cortador:p1', corteId: '', projetoId: 'p1' }),
      job({ id: 'ingestao:p1', corteId: '', projetoId: 'p1' }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].jobs).toHaveLength(2);
  });

  it('o erro manda no rótulo do grupo — um lote com falha não é "concluído"', () => {
    const grupos = agruparFila([
      job({ id: 'a:c1', corteId: 'c1', estado: 'concluido' }),
      job({ id: 'b:c1', corteId: 'c1', estado: 'erro' }),
      job({ id: 'c:c1', corteId: 'c1', estado: 'rodando' }),
    ]);

    expect(grupos[0].estado).toBe('erro');
    expect(grupos[0].destaque.id).toBe('b:c1');
  });

  it('sem erro, o que está rodando é o destaque', () => {
    const grupos = agruparFila([
      job({ id: 'a:c1', corteId: 'c1', estado: 'concluido' }),
      job({ id: 'b:c1', corteId: 'c1', estado: 'rodando', etapa: 'Fase 2/4: overlay 3/7' }),
    ]);

    expect(grupos[0].estado).toBe('rodando');
    expect(grupos[0].destaque.etapa).toBe('Fase 2/4: overlay 3/7');
  });

  it('cancelado não rouba o destaque de um concluído', () => {
    const grupos = agruparFila([
      job({ id: 'a:c1', corteId: 'c1', estado: 'cancelado' }),
      job({ id: 'b:c1', corteId: 'c1', estado: 'concluido' }),
    ]);

    expect(grupos[0].estado).toBe('concluido');
  });
});
