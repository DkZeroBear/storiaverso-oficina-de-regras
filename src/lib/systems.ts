import {
  Dices, Box, User, SlidersHorizontal, Wrench, Target, Shield, Swords, Timer, Zap,
  Battery, Sparkles, Users, TrendingUp, AlertTriangle, Skull, Compass, CircleDot, type LucideIcon,
} from "lucide-react";

export const SYSTEMS = [
  { key: "dnd", label: "D&D 5e" },
  { key: "ordem", label: "Ordem Paranormal" },
  { key: "fabula", label: "Fábula Ultima" },
  { key: "tdet", label: "3DeT Victory" },
  { key: "swade", label: "SWADE" },
] as const;

const ICONS: Record<string, LucideIcon> = {
  motor: Dices, dados: Box, atributos: User, funcao_atributos: SlidersHorizontal, pericias: Wrench,
  dificuldade: Target, defesa: Shield, combate: Swords, iniciativa: Timer, dano: Zap, recursos: Battery,
  poderes: Sparkles, classes: Users, progressao: TrendingUp, falhas_criticas: AlertTriangle,
  risco_adicional: Skull, enfase: Compass,
};
export const fieldIcon = (chave: string): LucideIcon => ICONS[chave] ?? CircleDot;

export const PARTICIPANT_PRIVACY =
  "As respostas são vistas somente pelo facilitador.";

export function formatPrazo(prazo: string | null) {
  if (!prazo) return "Sem prazo definido";
  return new Date(prazo).toLocaleString("pt-BR", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo",
  });
}
