import { useEffect, useState } from 'react';
import { Aurora } from '@/components/ui/aurora';
import { AvatarDoCanal } from '@/components/ui/avatar-do-canal';
import { Segmented } from '@/components/ui/segmented';
import { luzDoCanal, type TemaDaLuz } from '@/lib/luzDoCanal';
import { miniaturaDaCapa } from '@/lib/miniaturaDaCapa';
import { aplicarTemaNoDocumento } from './KitEstado';

// D-1127 (E-069 H-11c) · seção "Luz" do Kit: a aurora (com capa e sem) e o avatar do canal nas
// três fontes da luz. A capa de exemplo é desenhada num <canvas> aqui mesmo, para a prova não
// depender de rede nem de CORS. A montagem da página inteira é a H-12.

function capaDeExemplo(): string {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const g = c.getContext('2d');
  if (!g) return '';
  const grad = g.createLinearGradient(0, 0, 640, 360);
  grad.addColorStop(0, '#e0457b');
  grad.addColorStop(1, '#3b6df0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 360);
  return c.toDataURL('image/png');
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-micro text-fg-3">{titulo}</h3>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

function Cena({ rotulo, src }: { rotulo: string; src?: string | null }) {
  return (
    <div className="relative isolate h-40 w-72 overflow-hidden rounded-capa bg-app">
      <Aurora src={src} />
      <p className="relative p-3 text-pequeno text-fg-2">{rotulo}</p>
    </div>
  );
}

export function KitLuz() {
  const [tema, setTema] = useState<TemaDaLuz>('escuro');
  const [miniatura, setMiniatura] = useState<string | null>(null);
  useEffect(() => aplicarTemaNoDocumento(document.documentElement, tema === 'escuro' ? 'dark' : 'light'), [tema]);
  useEffect(() => {
    let vivo = true;
    miniaturaDaCapa(capaDeExemplo()).then((m) => vivo && setMiniatura(m));
    return () => {
      vivo = false;
    };
  }, []);

  const daPaleta = luzDoCanal({ paleta: { secundaria: '#7a2fd0', acento: '#e0457b' } }, tema);
  const daAmostra = luzDoCanal({ amostra: { a: '#1f9d8f', b: '#f0b43a' } }, tema);

  return (
    <div className="flex flex-col gap-6 p-4">
      <h2 className="text-secao text-fg">Luz</h2>
      <Segmented
        aria-label="Tema da seção Luz"
        value={tema}
        onValueChange={setTema}
        opcoes={[
          { valor: 'escuro', rotulo: 'Escuro' },
          { valor: 'claro', rotulo: 'Claro' },
        ]}
      />
      <Bloco titulo="Aurora · com a miniatura da capa e sem ela (só os halos)">
        <Cena rotulo="com capa" src={miniatura} />
        <Cena rotulo="sem capa" />
      </Bloco>
      <Bloco titulo="Avatar do canal · paleta, amostra das capas, neutro">
        <AvatarDoCanal nome="Canal do Sapo" luz={daPaleta} tamanho={48} />
        <AvatarDoCanal nome="Canal Dois" luz={daAmostra} tamanho={48} />
        <AvatarDoCanal nome="Sem Luz" luz={null} tamanho={48} />
      </Bloco>
    </div>
  );
}
