// D-1114 (E-069 H-07): o ícone na casa que a Sala escura prevê (`components/ui/`).
//
// O desenho continua em `upgrade/Icon.tsx`: a catraca `iconeDoTema` (teste travado)
// aponta para aquele caminho como a ÚNICA porta do lucide, e mover o arquivo agora
// a quebraria. Quando a catraca for atualizada com autorização do Paulo, a
// implementação muda de lugar e este arquivo vira a casa de verdade.
export * from '@/upgrade/Icon';
