import { expect } from 'vitest';

// D-1204 · O que todo estado de erro de tela precisa ter (DIRECAO §8.2): `role="alert"`, a frase
// que diz o que falhou e o que fazer, e o "Tentar de novo" que refaz a consulta. O vitest roda
// sem DOM: o clique é o `aoTentar` capturado das props entregues ao `EstadoDeErro`.

/** O recorte das props do `EstadoDeErro` que a prova usa (shared/ não importa components/). */
export interface ErroDesenhado {
  titulo: string;
  motivo?: string;
  aoTentar?: () => void;
}

export const SEM_BACKEND = 'O app não conseguiu falar com o backend. Confira se ele está rodando.';

export const quedaDeRede = () => new TypeError('Failed to fetch');

export function esperarEstadoDeErro(html: string, erros: ErroDesenhado[], titulo: string): ErroDesenhado {
  const erro = erros.find((e) => e.titulo === titulo);
  expect(erro, `sem EstadoDeErro "${titulo}"`).toBeDefined();
  expect(html).toContain('role="alert"');
  expect(html).toContain(titulo);
  expect(erro!.motivo).toContain(SEM_BACKEND);
  expect(html).toContain('Tentar de novo');
  expect(html).not.toContain('Failed to fetch');
  return erro!;
}
