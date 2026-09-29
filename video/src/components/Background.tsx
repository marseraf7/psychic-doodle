import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

// Nền xanh đậm, lưới chấm nhẹ trôi chậm để khung hình không bị "chết".
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = interpolate(frame, [0, 900], [0, 60]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 30%, ${COLORS.bg2} 0%, ${COLORS.bg} 70%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1.5px, transparent 1.5px)",
          backgroundSize: "40px 40px",
          backgroundPosition: `${shift}px ${shift / 2}px`,
        }}
      />
    </AbsoluteFill>
  );
};
