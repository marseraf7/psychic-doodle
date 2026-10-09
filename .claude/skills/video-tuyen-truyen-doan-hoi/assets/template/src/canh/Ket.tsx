import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhKet } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { ThanhPho } from "../thanh-phan/ThanhPho";
import { BieuTuong } from "../thanh-phan/BieuTuong";
import { FONT_NGHIENG, MAU } from "../theme";

// Cảnh kết: huy hiệu + khẩu hiệu vàng phát sáng + thành phố vàng, giữ khung đủ lâu cho nhạc kết.
export const Ket: React.FC<{ c: CanhKet; dur: number }> = ({ c }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f, fps, config: { damping: 13 } });
  const chu = interpolate(f, [14, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <NenDo />
      <ThanhPho batDau={8} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 90 }}>
        <div style={{ transform: `scale(${logo})` }}>
          <BieuTuong src={c.logo} cao={200} />
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: FONT_NGHIENG,
            fontWeight: 800,
            fontSize: 70,
            letterSpacing: 2,
            color: MAU.vang,
            textShadow: `0 0 18px ${MAU.vangKim}, 0 0 40px rgba(255,180,0,0.6)`,
            textTransform: "uppercase",
            opacity: chu,
            clipPath: `inset(0 ${(1 - chu) * 50}% 0 ${(1 - chu) * 50}%)`,
          }}
        >
          {c.khauHieu}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
