import type { CSSProperties } from "react";
import type { IconName } from "./icon-registry.generated.ts";

// Production icon pattern from the Nenaugad kit: external same-origin sprite,
// decorative by default (action names live on the button, not the glyph).
export function Icon({ name, size = 20, className, style }: {
  name: IconName; size?: number; className?: string; style?: CSSProperties;
}) {
  return <svg className={className ?? "ng-icon"} width={size} height={size} viewBox="0 0 24 24"
    style={style} aria-hidden="true" focusable="false">
    <use href={`/icons/nenaugad.sprite.svg#ng-${name}`} />
  </svg>;
}
