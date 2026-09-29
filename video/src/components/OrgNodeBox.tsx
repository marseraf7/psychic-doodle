import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONT } from "../theme";
import { NODE_H, OrgNode, branchColor } from "../data";

export const OrgNodeBox: React.FC<{ node: OrgNode; dim: number }> = ({
  node,
  dim,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: frame - node.appearAt,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const color = branchColor(node.branch);
  const opacity = interpolate(pop, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: node.x - node.w / 2,
        top: node.y - NODE_H / 2,
        width: node.w,
        height: NODE_H,
        transform: `translateY(${(1 - pop) * 30}px) scale(${0.85 + pop * 0.15})`,
        opacity: opacity * dim,
        borderRadius: 18,
        background: "rgba(255,255,255,0.06)",
        border: `2px solid ${color}`,
        boxShadow: `0 0 ${24 * pop}px ${color}55, inset 0 0 0 1px rgba(255,255,255,0.04)`,
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        color: COLORS.text,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background:
            node.branch === "top"
              ? `linear-gradient(90deg, ${COLORS.red}, ${COLORS.gold})`
              : color,
        }}
      />
      <div style={{ fontSize: 32, fontWeight: 800, textAlign: "center", padding: "0 20px" }}>
        {node.title}
      </div>
      {node.subtitle && (
        <div style={{ fontSize: 23, fontWeight: 400, color: COLORS.muted, marginTop: 6 }}>
          {node.subtitle}
        </div>
      )}
    </div>
  );
};
