"use client";

import { IconButton } from "@/components/ui/icon-button";
import { IconStar } from "@/components/ui/icons";

export function FavoriteButton({
  pressed,
  label,
  onToggle,
}: {
  pressed: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <IconButton label={label} aria-pressed={pressed} onClick={onToggle}>
      <IconStar filled={pressed} className={pressed ? "text-fg" : "text-fg-muted"} />
    </IconButton>
  );
}
