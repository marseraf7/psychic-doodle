import { evolvePath } from "@remotion/paths";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT, HEIGHT, WIDTH } from "../theme";
import { EDGES, NODES, NODE_H, OrgEdge, Branch } from "../data";

const byId = (id: string) => {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`Không tìm thấy ô "${id}" trong data.ts`);
  return n;
};

const DRAW = 22; // số khung hình để vẽ xong một đường nối

const progress = (frame: number, e: OrgEdge) =>
  interpolate(frame, [e.appearAt, e.appearAt + DRAW], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

export const Edges: React.FC<{ dimFor: (b: Branch) => number }> = ({ dimFor }) => {
  const frame = useCurrentFrame();

  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
      {EDGES.map((e) => {
        const a = byId(e.from);
        const b = byId(e.to);
        const p = progress(frame, e);
        const opacity = Math.min(dimFor(a.branch), dimFor(b.branch));

        if (e.dashed) {
          // Đường ngang nét đứt nối hai tổ chức cùng cấp.
          const x1 = a.x + a.w / 2;
          const x2 = b.x - b.w / 2;
          const xe = x1 + (x2 - x1) * p;
          const mid = (x1 + x2) / 2;
          return (
            <g key={`${e.from}-${e.to}`} opacity={opacity}>
              <line
                x1={x1}
                y1={a.y}
                x2={xe}
                y2={b.y}
                stroke={COLORS.gold}
                strokeWidth={4}
                strokeDasharray="14 10"
                strokeLinecap="round"
              />
              {e.label && (
                <text
                  x={mid}
                  y={a.y - 18}
                  textAnchor="middle"
                  fill={COLORS.gold}
                  fontFamily={FONT}
                  fontWeight={600}
                  fontSize={24}
                  opacity={interpolate(p, [0.6, 1], [0, 1], { extrapolateLeft: "clamp" })}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        }

        // Đường gấp khúc từ đáy ô cha xuống đỉnh ô con.
        const y1 = a.y + NODE_H / 2;
        const y2 = b.y - NODE_H / 2;
        const ym = (y1 + y2) / 2;
        const d = `M ${a.x} ${y1} L ${a.x} ${ym} L ${b.x} ${ym} L ${b.x} ${y2}`;
        const { strokeDasharray, strokeDashoffset } = evolvePath(p, d);
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={d}
            fill="none"
            stroke={COLORS.line}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
};
