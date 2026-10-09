import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ChuyenCanh as Kieu } from "../types";

// Bọc một cảnh để thêm hiệu ứng vào cảnh: lóe sáng (light leak) hoặc zoom mờ.
export const VaoCanh: React.FC<{ kieu?: Kieu; children: React.ReactNode }> = ({ kieu = "cat", children }) => {
  const f = useCurrentFrame();
  if (kieu === "zoom-mo") {
    const s = interpolate(f, [0, 10], [1.25, 1], { extrapolateRight: "clamp" });
    const b = interpolate(f, [0, 10], [18, 0], { extrapolateRight: "clamp" });
    return <AbsoluteFill style={{ transform: `scale(${s})`, filter: `blur(${b}px)` }}>{children}</AbsoluteFill>;
  }
  if (kieu === "loe-sang") {
    const a = interpolate(f, [0, 3, 12], [0.95, 0.8, 0], { extrapolateRight: "clamp" });
    return (
      <AbsoluteFill>
        {children}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 30% 50%, rgba(255,250,220,1) 0%, rgba(255,210,120,0.85) 40%, rgba(255,160,60,0) 80%)",
            opacity: a,
            mixBlendMode: "screen",
          }}
        />
      </AbsoluteFill>
    );
  }
  return <>{children}</>;
};
