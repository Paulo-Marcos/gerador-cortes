import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arquivosRastreados } from './catraca';

// D-1195 (E-069 H-25; DIRECAO §8.2 Texto): o nome acessível é texto da tela, lido em voz
// alta. A auditoria achou rótulos sem acento e em inglês nos controles do Editor e da Pós
// ("Inicio", "Play/Pause", "Ferramentas avancadas", "regiao"…), que o leitor de tela
// pronuncia errado. A lista abaixo é das palavras que a auditoria achou, não um dicionário.
const SEM_ACENTO = /\b(?:inicio|avancadas|regiao|transcricao|Play\/Pause)\b/i;

// O nome acessível e a dica: `aria-label`, a prop `ariaLabel` que vira um, o `label` do Tooltip e o `title`.
const ATRIBUTO = /\b(?:aria-label|ariaLabel|label|title)="([^"]+)"/g;

function rotulos(): Array<{ arquivo: string; texto: string }> {
  return arquivosRastreados()
    .filter((c) => c.endsWith('.tsx'))
    .flatMap((arquivo) => [...readFileSync(arquivo, 'utf8').matchAll(ATRIBUTO)].map((m) => ({ arquivo, texto: m[1] })));
}

describe('nome acessível com acento e em português', () => {
  it('a busca lê o texto inteiro, mesmo com dois-pontos dentro, e em qualquer caixa', () => {
    expect([...'<Tooltip label="[: ajusta a regiao">'.matchAll(ATRIBUTO)].map((m) => m[1])).toEqual(['[: ajusta a regiao']);
    expect(SEM_ACENTO.test('[: ajusta a regiao')).toBe(true);
    expect(SEM_ACENTO.test('ajusta o INICIO do corte')).toBe(true);
    expect([...'<Botao ariaLabel="Usar no inicio" />'.matchAll(ATRIBUTO)].map((m) => m[1])).toEqual(['Usar no inicio']);
  });

  it('nenhum aria-label, ariaLabel, label de dica ou title traz as palavras sem acento que a auditoria achou', () => {
    const ruins = rotulos()
      .filter((r) => SEM_ACENTO.test(r.texto))
      .map((r) => `${r.arquivo}: ${r.texto}`);
    expect(ruins).toEqual([]);
  });
});
