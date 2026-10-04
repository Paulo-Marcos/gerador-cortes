import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { acoesDoWorkspace } from '../acoesDoWorkspace';

// D-867 (Onda 3, nota 2): Reanalisar, refazer transcrição, auditar e abrir a
// pasta saem da fileira de ícones soltos do Workspace e ganham rótulo num
// "Mais" (⋯) do cabeçalho.

function montar(extra: Partial<Parameters<typeof acoesDoWorkspace>[0]> = {}) {
  const fns = {
    novoCorte: vi.fn(),
    reanalisar: vi.fn(),
    refazerTranscricao: vi.fn(),
    auditar: vi.fn(),
    abrirPasta: vi.fn(),
  };
  const acoes = acoesDoWorkspace({
    youtubeUrl: 'https://youtu.be/x',
    temCortes: true,
    abrindoPasta: false,
    refazendoTranscricao: false,
    ...fns,
    ...extra,
  });
  const mais = acoes.find((a) => a.texto === 'Mais');
  return { acoes, mais, fns };
}

const pagina = readFileSync(resolve(__dirname, '../WorkspaceProjetoPage.tsx'), 'utf8');
const hook = readFileSync(resolve(__dirname, '../useWorkspaceProjeto.tsx'), 'utf8');

describe('acoesDoWorkspace', () => {
  it('Ver no YouTube abre a live numa aba nova, sem dar acesso à janela do app', () => {
    const abrir = vi.fn();
    vi.stubGlobal('window', { open: abrir });
    montar().acoes.find((a) => a.texto === 'Ver no YouTube')!.onClick!();
    expect(abrir).toHaveBeenCalledWith('https://youtu.be/x', '_blank', 'noopener,noreferrer');
    vi.unstubAllGlobals();
  });

  it('o cabeçalho tem Ver no YouTube, Novo corte e, por último, o Mais', () => {
    expect(montar().acoes.map((a) => a.texto)).toEqual(['Ver no YouTube', 'Novo corte', 'Mais']);
    expect(montar({ youtubeUrl: null }).acoes.map((a) => a.texto)).toEqual(['Novo corte', 'Mais']);
  });

  it('o Mais traz as quatro ações raras, com rótulo, nesta ordem', () => {
    expect(montar().mais?.menu?.map((i) => i.label)).toEqual([
      'Reanalisar',
      'Refazer transcrição',
      'Auditar análise',
      'Abrir a pasta do projeto',
    ]);
  });

  it('cada item chama a sua ação', () => {
    const { mais, fns } = montar();
    const item = (rotulo: string) => mais!.menu!.find((i) => i.label === rotulo)!;
    item('Reanalisar').onClick!();
    item('Refazer transcrição').onClick!();
    item('Auditar análise').onClick!();
    item('Abrir a pasta do projeto').onClick!();
    expect(fns.reanalisar).toHaveBeenCalledOnce();
    expect(fns.refazerTranscricao).toHaveBeenCalledOnce();
    expect(fns.auditar).toHaveBeenCalledOnce();
    expect(fns.abrirPasta).toHaveBeenCalledOnce();
  });

  it('os ícones seguem os conceitos: auditar é o da lista de conferência', () => {
    const icones = Object.fromEntries(montar().mais!.menu!.map((i) => [i.label, i.icon]));
    expect(icones['Auditar análise']).toBe(ICONE_DO_CONCEITO.auditar);
    expect(icones['Reanalisar']).toBe('brain');
  });

  it('desliga o que não cabe agora, dizendo por quê', () => {
    const { mais } = montar({ temCortes: false, abrindoPasta: true, refazendoTranscricao: true });
    const item = (rotulo: string) => mais!.menu!.find((i) => i.label === rotulo)!;
    expect(item('Auditar análise').disabled).toBe(true);
    expect(item('Auditar análise').title).toMatch(/sem cortes/i);
    expect(item('Abrir a pasta do projeto').disabled).toBe(true);
    expect(item('Refazer transcrição').disabled).toBe(true);
    expect(item('Reanalisar').disabled).toBeFalsy();
  });
});

describe('Workspace sem a fileira de ícones soltos', () => {
  it('as quatro ações saem do corpo da tela', () => {
    expect(pagina).not.toContain('titulo="Abrir a pasta do projeto"');
    expect(pagina).not.toMatch(/titulo="Refazer transcrição/);
    expect(pagina).not.toMatch(/titulo="Auditar análise/);
    expect(pagina).not.toMatch(/>\s*Reanalisar\s*</);
  });

  it('o cabeçalho do Workspace usa estas ações, ligadas ao estado real', () => {
    const chamada = hook.slice(hook.indexOf('acoes: acoesDoWorkspace({'));
    const bloco = chamada.slice(0, chamada.indexOf('}),'));
    for (const fio of [
      'youtubeUrl: dados?.youtube_url',
      'temCortes: cortes.length > 0',
      'abrindoPasta: pasta.abrindo',
      'refazendoTranscricao: refazerTranscricao.isPending',
      'novoCorte: () => setNovoCorteAberto(true)',
      'reanalisar: () => setAnaliseAberta(true)',
      'refazerTranscricao: dispararRefazerTranscricao',
      'auditar: () => setAuditoriaAberta(true)',
      'abrirPasta: pasta.abrir',
    ])
      expect(bloco).toContain(fio);
  });

  it('abrir a pasta leva junto o aviso de erro que o botão tinha', () => {
    expect(hook).toMatch(/abrirPasta\.mutate\(id, \{\s*onError:[\s\S]*?Não consegui abrir a pasta/);
  });
});
