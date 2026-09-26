// D-286 (Phase C) — painel de diarização de falantes na Análise IA.
//
// Fica dentro do bloco "AI" do AnaliseIaModal. Oferece: (1) o toggle de usar a
// diarização no prompt, (2) rodar a diarização sob demanda, e (3) rebatizar os
// falantes (nome + quem é o canal) antes de gerar os cortes.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mic, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FalantesMap } from '@/features/diarizacao/api';
import {
  useAtualizarFalantes,
  useDiarizarProjeto,
  useFalantes,
} from '@/hooks/useDiarizacao';

interface Props {
  projetoId: string;
  enabled: boolean;
  usarDiarizacao: boolean;
  onToggleUsar: (value: boolean) => void;
}

export function DiarizacaoPanel({ projetoId, enabled, usarDiarizacao, onToggleUsar }: Props) {
  const falantesQuery = useFalantes(projetoId, enabled);
  const diarizar = useDiarizarProjeto(projetoId);
  const salvar = useAtualizarFalantes(projetoId);

  const [rascunho, setRascunho] = useState<FalantesMap>({});

  // Sincroniza o rascunho editável quando o mapa persistido carrega/muda.
  useEffect(() => {
    if (falantesQuery.data?.falantes) setRascunho(falantesQuery.data.falantes);
  }, [falantesQuery.data]);

  const speakers = useMemo(() => Object.keys(rascunho), [rascunho]);
  const temFalantes = speakers.length > 0;

  const sujo = useMemo(
    () => JSON.stringify(rascunho) !== JSON.stringify(falantesQuery.data?.falantes ?? {}),
    [rascunho, falantesQuery.data],
  );

  const setNome = (sid: string, nome: string) =>
    setRascunho((prev) => ({ ...prev, [sid]: { ...prev[sid], nome } }));

  const setCanal = (sid: string) =>
    setRascunho((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...v, is_canal: k === sid }]),
      ),
    );

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/40 p-3">
      <label className="flex items-start gap-2 text-xs text-text-200">
        <input
          type="checkbox"
          checked={usarDiarizacao}
          onChange={(e) => onToggleUsar(e.target.checked)}
          className="mt-0.5 h-4 w-4"
          aria-label="Usar diarização na análise"
        />
        <span className="flex-1">
          <span className="flex items-center gap-1.5 font-semibold text-text-100">
            <Users size={14} className="text-accent-300" /> Usar diarização de falantes
          </span>
          <span className="mt-0.5 block text-[11px] text-text-300">
            Marca no prompt quem fala em cada trecho ({'['}CANAL{']'} vs. {'['}OUTRO{']'}) para a
            IA não misturar a fala do dono do canal com a fala reagida.
          </span>
        </span>
      </label>

      {usarDiarizacao && (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-text-300">
              {temFalantes
                ? `${speakers.length} falante(s) identificado(s). Renomeie e marque quem é o canal.`
                : 'Ainda não diarizado. Rode a diarização sobre o áudio do vídeo.'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => diarizar.mutate()}
              disabled={diarizar.isPending}
              className="shrink-0"
            >
              {diarizar.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Mic size={14} />
              )}
              {temFalantes ? 'Re-diarizar' : 'Diarizar falantes'}
            </Button>
          </div>

          {temFalantes && (
            <div className="flex flex-col gap-2">
              {speakers.map((sid) => (
                <div key={sid} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-text-400">{sid}</span>
                  <Input
                    value={rascunho[sid]?.nome ?? ''}
                    onChange={(e) => setNome(sid, e.target.value)}
                    placeholder="Nome (ex.: Pedro)"
                    className="h-8 flex-1 text-xs"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-text-200">
                    <input
                      type="radio"
                      name={`canal-${projetoId}`}
                      checked={Boolean(rascunho[sid]?.is_canal)}
                      onChange={() => setCanal(sid)}
                      className="h-3.5 w-3.5"
                    />
                    é o canal
                  </label>
                </div>
              ))}
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => salvar.mutate(rascunho)}
                  disabled={!sujo || salvar.isPending}
                >
                  {salvar.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Salvar nomes
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
