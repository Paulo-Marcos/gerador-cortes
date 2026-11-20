// D-1168 (E-069 H-20; DIRECAO §5 e §7.6) · O ÚNICO selo da linha do Fire: de quem é a vez.
//
// A linha mostra um selo só; contagens, duração e redes são texto de metadado. A ordem
// das perguntas é a de "o que o operador precisa saber primeiro": já acabou? falta o
// vídeo-base? já tem short pronto? alguém mexeu? a IA propôs e ninguém olhou? nada ainda?
import type { TomDoSelo } from '@/components/ui/selo';
import { estaFinalizado, temEdicao } from './filtrosDosFires';
import type { FireComBruto } from './shortsApi';

export interface SeloDoFire {
  tom: TomDoSelo;
  rotulo: string;
  dica: string;
}

export function seloDoFire(fire: FireComBruto): SeloDoFire {
  if (estaFinalizado(fire)) {
    return { tom: 'ok', rotulo: 'Finalizado', dica: 'Os shorts deste corte já estão no YouTube, TikTok e Instagram' };
  }
  if (!fire.tem_bruto) {
    return { tom: 'convite', rotulo: 'Sem bruto', dica: 'O vídeo do bruto saiu do disco: precisa regerar' };
  }
  if (fire.shorts.renderizado > 0) {
    return { tom: 'convite', rotulo: 'Tem pronto', dica: 'Já existe pelo menos um short renderizado, pronto para subir' };
  }
  if (temEdicao(fire)) {
    return { tom: 'neutro', rotulo: 'Em curadoria', dica: 'Você já decidiu, marcou trecho, escreveu gancho ou mexeu no palco deste corte' };
  }
  if (fire.shorts.total > 0) {
    return { tom: 'inerte', rotulo: 'Não comecei', dica: 'A IA propôs candidatos e ninguém passou por eles ainda' };
  }
  return { tom: 'inerte', rotulo: 'Sem candidatos', dica: 'Ainda não há trecho proposto para este corte' };
}
