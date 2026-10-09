import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MAU } from "../theme";

// Nền đỏ có các vòng cung mờ xoay chậm, giống phông các cảnh đồ họa trong video mẫu.
export const NenDo: React.FC<{ toiGoc?: boolean }> = ({ toiGoc = true }) => {
  const frame = useCurrentFrame();
  const xoay = interpolate(frame, [0, 600], [0, 25]);
  const vong = [520, 760, 1000, 1240];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${MAU.doSang} 0%, ${MAU.do} 45%, ${MAU.doDam} 100%)`,
        overflow: "hidden",
      }}
    >
      {vong.map((r, i) => (
        <div
          key={r}
          style={{
            position: "absolute",
            left: 960 - r / 2,
            top: 600 - r / 2,
            width: r,
            height: r,
            borderRadius: "50%",
            border: `${60 - i * 10}px solid rgba(255,255,255,${0.05 - i * 0.008})`,
            borderLeftColor: "transparent",
            borderBottomColor: "transparent",
            transform: `rotate(${(i % 2 ? -1 : 1) * xoay + i * 40}deg)`,
          }}
        />
      ))}
      {toiGoc && (
        <AbsoluteFill
          style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(80,0,0,0.45) 100%)" }}
        />
      )}
    </AbsoluteFill>
  );
};
