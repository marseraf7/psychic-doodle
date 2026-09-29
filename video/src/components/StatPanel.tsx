import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../theme";
import { StatCard } from "../data";

// Bảng số liệu trượt vào bên cạnh khi "máy quay" tập trung vào một nhánh.
export const StatPanel: React.FC<{
  side: "left" | "right";
  heading: string;
  color: string;
  stats: StatCard[];
  durationInFrames: number;
}> = ({ side, heading, color, stats, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dir = side === "right" ? 1 : -1;
  const out = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const panelIn = spring({ frame: frame - 10, fps, config: { damping: 18 } });

  return (
    <div
      style={{
        position: "absolute",
        top: 170,
        [side]: 60,
        width: 620,
        padding: "34px 36px 10px",
        borderRadius: 24,
        background: "rgba(10,20,48,0.88)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        fontFamily: FONT,
        color: COLORS.text,
        opacity: panelIn * out,
        transform: `translateX(${(1 - panelIn) * 80 * dir}px)`,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600, color, letterSpacing: 2, textTransform: "uppercase" }}>
        {heading}
      </div>
      <div style={{ height: 4, width: 120 * panelIn, background: color, margin: "14px 0 30px" }} />
      {stats.map((s, i) => {
        const p = spring({ frame: frame - 25 - i * 12, fps, config: { damping: 16 } });
        return (
          <div
            key={s.label}
            style={{
              marginBottom: 26,
              padding: "22px 28px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.07)",
              borderLeft: `6px solid ${color}`,
              opacity: p,
              transform: `translateX(${(1 - p) * 60 * dir}px)`,
            }}
          >
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.05 }}>{s.value}</div>
            <div style={{ fontSize: 25, color: COLORS.muted, marginTop: 6 }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
};
