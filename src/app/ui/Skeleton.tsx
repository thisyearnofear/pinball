import React from "react";
import { colors, radius } from "@/theme/tokens";

type Props = {
  count?: number;
  height?: number | string;
  width?: number | string;
  style?: React.CSSProperties;
};

export function Skeleton({ count = 1, height = 16, width = "100%", style }: Props) {
  const baseStyle: React.CSSProperties = {
    height: typeof height === "number" ? `${height}px` : height,
    width: typeof width === "number" ? `${width}px` : width,
    borderRadius: radius.md,
    background: `linear-gradient(90deg, ${colors.border.subtle} 25%, ${colors.border.default} 50%, ${colors.border.subtle} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
    ...style,
  };

  if (count === 1) return <div style={baseStyle} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={baseStyle} />
      ))}
    </div>
  );
}
