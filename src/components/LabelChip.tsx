import { cn } from "@/lib/utils";

export type LabelKind = "good" | "bad" | "best";

const styles: Record<LabelKind, string> = {
  good: "border-label-good/40 text-label-good",
  bad: "border-label-bad/40 text-label-bad",
  best: "border-label-best/50 text-label-best",
};

const activeStyles: Record<LabelKind, string> = {
  good: "bg-label-good/10 border-label-good text-label-good",
  bad: "bg-label-bad/10 border-label-bad text-label-bad",
  best: "bg-label-best/10 border-label-best text-label-best",
};

export function LabelChip({
  kind,
  active,
  onClick,
  size = "sm",
}: {
  kind: LabelKind;
  active?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border rounded-full uppercase tracking-[0.16em] transition-colors",
        size === "sm" ? "text-[10px] px-2.5 py-1" : "text-[11px] px-3 py-1.5",
        active ? activeStyles[kind] : `${styles[kind]} bg-transparent hover:bg-secondary/40`,
      )}
    >
      {kind}
    </button>
  );
}
