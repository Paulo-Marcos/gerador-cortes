import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EditorialSkill, SkillVersao } from '@/lib/editorialSkillsApi';
import { EditorialSkillCard } from '../EditorialSkillCard';
import { EditorialSkillHistory, formatarData } from '../EditorialSkillHistory';
import { skillCustomizada } from '../EditorialSkillsSection';

const base: EditorialSkill = {
  key: 'cortador-expert',
  etapa: 'Propor cortes',
  descricao: 'Analisa a live e propõe os cortes.',
  corpo: 'CORPO',
  params: { modelo: 'opus', thinking_tokens: 0, timeout: 300 },
  lentes: ['a', 'b'],
  corpo_default: 'CORPO',
  params_default: { modelo: 'opus', thinking_tokens: 0, timeout: 300 },
  lentes_default: ['a', 'b'],
};

describe('skillCustomizada', () => {
  it('é falso quando corpo, params e lentes batem com o default', () => {
    expect(skillCustomizada(base)).toBe(false);
  });

  it('detecta corpo alterado', () => {
    expect(skillCustomizada({ ...base, corpo: 'OUTRO' })).toBe(true);
  });

  it('detecta modelo alterado', () => {
    expect(skillCustomizada({ ...base, params: { ...base.params, modelo: 'haiku' } })).toBe(true);
  });

  it('detecta lentes alteradas', () => {
    expect(skillCustomizada({ ...base, lentes: ['a'] })).toBe(true);
  });
});

describe('EditorialSkillCard', () => {
  it('mostra a etapa, a descrição e o modelo em uso', () => {
    const html = renderToStaticMarkup(
      <EditorialSkillCard skill={base} customizada={false} onEditar={vi.fn()} />,
    );
    expect(html).toContain('Propor cortes');
    expect(html).toContain('Analisa a live e propõe os cortes.');
    expect(html).toContain('modelo: opus');
    expect(html).toContain('Padrão');
  });

  it('marca "Customizado" quando o canal divergiu do padrão', () => {
    const html = renderToStaticMarkup(
      <EditorialSkillCard skill={base} customizada onEditar={vi.fn()} />,
    );
    expect(html).toContain('Customizado');
  });
});

const versoes: SkillVersao[] = [
  {
    versao: 2,
    criado_em: '2026-07-09T12:00:00+00:00',
    vigente: true,
    resumo: 'prompt',
    mudancas: ['corpo'],
  },
  {
    versao: 1,
    criado_em: '2026-07-08T10:00:00+00:00',
    vigente: false,
    resumo: 'Versão inicial',
    mudancas: [],
  },
];

describe('EditorialSkillHistory', () => {
  it('lista as versões com resumo e marca a vigente como "Em uso"', () => {
    const html = renderToStaticMarkup(
      <EditorialSkillHistory
        versoes={versoes}
        carregando={false}
        erro={null}
        pending={false}
        onReverter={vi.fn()}
      />,
    );
    expect(html).toContain('v2');
    expect(html).toContain('v1');
    expect(html).toContain('Em uso');
    expect(html).toContain('Versão inicial');
    // A versão vigente não oferece "Reverter"; a antiga sim.
    expect(html).toContain('Reverter');
  });

  it('mostra estado vazio quando não há versões', () => {
    const html = renderToStaticMarkup(
      <EditorialSkillHistory
        versoes={[]}
        carregando={false}
        erro={null}
        pending={false}
        onReverter={vi.fn()}
      />,
    );
    expect(html).toContain('Sem versões registradas ainda.');
  });
});

describe('formatarData', () => {
  it('devolve travessão para string vazia', () => {
    expect(formatarData('')).toBe('—');
  });

  it('devolve o cru quando não parseia', () => {
    expect(formatarData('não-é-data')).toBe('não-é-data');
  });
});
