import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arquivosRastreados } from './catraca';

// D-1195 (E-069 H-25; DIRECAO §8.2 Texto): o nome acessível é texto da tela, lido em voz
// alta. A auditoria achou rótulos sem acento e em inglês nos controles do Editor e da Pós
// ("Inicio", "Play/Pause", "Ferramentas avancadas", "regiao"…), que o leitor de tela
// pronuncia errado. A lista abaixo é das palavras que a auditoria achou, não um dicionário.
const SEM_ACENTO = /\b(?:inicio|Inicio|avancadas|regiao|transcricao|Play\/Pause)\b/;

// Ainda sem acento porque um teste travado (testes-sao-contrato) cita o texto exato;
// a troca da referência espera o unlock do dono.
const PENDENTES = new Set(['Marcar inicio aqui', 'Atualizar transcricao']);

function rotulos(): string[] {
  return arquivosRastreados()
    .filter((c) => c.endsWith('.tsx'))
    .flatMap((c) => [...readFileSync(c, 'utf8').matchAll(/(?:aria-label|label)="([^"]+)"/g)].map((m) => `${c}: ${m[1]}`));
}

describe('nome acessível com acento e em português', () => {
  it('nenhum aria-label ou label de dica traz as palavras sem acento que a auditoria achou', () => {
    const ruins = rotulos().filter((r) => SEM_ACENTO.test(r.split(': ')[1]) && !PENDENTES.has(r.split(': ')[1]));
    expect(ruins).toEqual([]);
  });
});
