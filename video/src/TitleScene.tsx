import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT } from "./theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t1 = spring({ frame, fps, config: { damping: 16 } });
  const t2 = spring({ frame: frame - 12, fps, config: { damping: 16 } });
  const bar = interpolate(frame, [8, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT, color: COLORS.text, opacity: out }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 6,
          color: COLORS.gold,
          opacity: t1,
          transform: `translateY(${(1 - t1) * 20}px)`,
        }}
      >
        CƠ CẤU TỔ CHỨC
      </div>
      <div
        style={{
          height: 6,
          width: 420 * bar,
          margin: "26px 0",
          background: `linear-gradient(90deg, ${COLORS.red}, ${COLORS.gold})`,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          fontSize: 76,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.2,
          opacity: t2,
          transform: `translateY(${(1 - t2) * 40}px)`,
        }}
      >
        Đoàn – Hội Sinh viên Việt Nam
        <br />
        tại Liên bang Nga
      </div>
    </AbsoluteFill>
  );
};
