import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT } from "./theme";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 18 } });
  const note = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT, color: COLORS.text }}>
      <div style={{ fontSize: 64, fontWeight: 800, opacity: t, transform: `scale(${0.9 + t * 0.1})`, textAlign: "center" }}>
        Kết nối tri thức · Lan tỏa văn hóa
        <br />
        <span style={{ color: COLORS.gold }}>Kiến tạo tương lai</span>
      </div>
      <div style={{ position: "absolute", bottom: 60, fontSize: 22, color: COLORS.muted, opacity: note }}>
        Bản dựng thử · Số liệu tổng hợp từ báo chí, cần xác minh trước khi phát hành
      </div>
    </AbsoluteFill>
  );
};
