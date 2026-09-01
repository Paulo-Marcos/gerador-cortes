import { describe, expect, it } from 'vitest';
import { planoDaFabrica } from '../planoFabricaShorts';

describe('planoDaFabrica', () => {
  it('nao oferece nada em corte sem Fire', () => {
    expect(planoDaFabrica({ is_fire: false, tem_bruto: true, total_shorts: 0 }).oferecer).toBe(
      false,
    );
  });

  it('nao oferece nada enquanto a elegibilidade nao carregou', () => {
    expect(planoDaFabrica(undefined).oferecer).toBe(false);
  });

  it('com bruto em disco, o rotulo nao promete regeracao', () => {
    const plano = planoDaFabrica({ is_fire: true, tem_bruto: true, total_shorts: 0 });

    expect(plano.rotulo).toBe('Gerar shorts');
    expect(plano.avisos).toEqual([]);
  });

  it('sem bruto, o rotulo AVISA que havera regeracao', () => {
    // O clique dispara um render de varios minutos; quem clica precisa saber.
    const plano = planoDaFabrica({ is_fire: true, tem_bruto: false, total_shorts: 0 });

    expect(plano.rotulo).toBe('Regerar bruto e gerar shorts');
    expect(plano.avisos[0]).toContain('sem tocar em cenas');
  });

  it('candidatos existentes viram aviso sobre o que sobrevive', () => {
    const plano = planoDaFabrica({ is_fire: true, tem_bruto: true, total_shorts: 4 });

    expect(plano.avisos).toHaveLength(1);
    expect(plano.avisos[0]).toContain('4 candidato');
    expect(plano.avisos[0]).toContain('aprovou ou rejeitou continuam');
  });

  it('corte antigo sem bruto e com candidatos junta os dois avisos', () => {
    const plano = planoDaFabrica({ is_fire: true, tem_bruto: false, total_shorts: 2 });

    expect(plano.avisos).toHaveLength(2);
  });
});

describe('planoDaFabrica quando a checagem falha', () => {
  it('NAO se esconde: falha e "nao e Fire" sao coisas diferentes', () => {
    const plano = planoDaFabrica(undefined, { falhou: true });

    expect(plano.oferecer).toBe(false);
    expect(plano.indisponivel).toBeTruthy();
  });

  it('a mensagem diz o que fazer, nao so que deu errado', () => {
    const plano = planoDaFabrica(undefined, { falhou: true });

    expect(plano.indisponivel).toContain('reinicie');
  });

  it('sucesso nao carrega mensagem de indisponivel', () => {
    const plano = planoDaFabrica({ is_fire: true, tem_bruto: true, total_shorts: 0 });

    expect(plano.indisponivel).toBeUndefined();
  });
});
