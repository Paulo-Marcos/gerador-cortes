// Todo ícone passa pelo upgrade/Icon (D-853). Quarta catraca, irmã das de
// tamanho (D-771, D-772) e de cor solta (D-849): arquivo que importa o
// lucide-react fora do próprio Icon falha.
//
// O Icon é onde mora a escala (14 px junto de texto, 16 em botão e barra, 20
// no trilho, `ilustracao` para figura grande) e o traço único de 1,75. Ícone
// importado direto do lucide escapa dos dois: foi assim que o app chegou a 24
// tamanhos e a traços de 0,3 a 3. Eram 113 arquivos importando direto em
// 01/10/2026; a lista de exceção nasceu com 106 (D-853) e zerou na Onda 2
// (D-854 a D-857), então a regra agora não tem exceção.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// O próprio Icon é a única porta para o lucide.
const PORTA = 'src/upgrade/Icon.tsx';
const TESTES = /(__tests__\/|\.test\.tsx?$)/;
// Qualquer referência ao pacote, não só o import estático da raiz: caminho
// interno (`lucide-react/dist/...`), `import()` e `require` também furam a
// escala (achado da auditoria do #99).
const IMPORTA_LUCIDE = /['"]lucide-react(?:\/[^'"]*)?['"]/;

function quemImportaLucide(): Set<string> {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && caminho !== PORTA && !TESTES.test(caminho));
  return new Set(arquivos.filter((caminho) => IMPORTA_LUCIDE.test(readFileSync(caminho, 'utf8'))));
}

describe('ícone pelo Icon (D-853)', () => {
  it('ninguém importa o lucide fora do Icon', () => {
    expect([...quemImportaLucide()], 'Use <Icon name=...> do upgrade/Icon').toEqual([]);
  });
});
