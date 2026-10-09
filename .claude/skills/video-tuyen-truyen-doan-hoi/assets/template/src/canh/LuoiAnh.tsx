import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhLuoiAnh } from "../types";
import { Media } from "../thanh-phan/Media";

// Lưới ảnh: 4 ảnh (2×2) hoặc 6 ảnh (3×2) ngăn bởi khe đen, từng ô bật vào so le.
export const LuoiAnh: React.FC<{ c: CanhLuoiAnh; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = c.anh.length >= 6 ? 6 : 4;
  const cot = n === 6 ? 3 : 2;
  const o = Array.from({ length: n }, (_, i) => c.anh[i]);
  return (
    <AbsoluteFill
      style={{
        background: "#000",
        display: "grid",
        gridTemplateColumns: `repeat(${cot}, 1fr)`,
        gridTemplateRows: "1fr 1fr",
        gap: 14,
        padding: 14,
      }}
    >
      {o.map((src, i) => {
        const p = spring({ frame: f - i * 4, fps, config: { damping: 16 } });
        return (
          <div key={i} style={{ position: "relative", overflow: "hidden", opacity: p, transform: `scale(${0.85 + p * 0.15})` }}>
            <Media src={src} chuyenDong={i % 2 ? "zoom-ra" : "zoom-vao"} thoiLuong={dur} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
