import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CanhTuongAnh } from "../types";
import { Media } from "../thanh-phan/Media";
import { MAU } from "../theme";

// Tường ảnh 3D: mặt phẳng nghiêng phủ ảnh đen trắng, một số ảnh "nổi" lên có màu và viền xanh,
// máy quay lia chéo — đoạn tổng kết trước cảnh kết trong video mẫu.
const COT = 7;
const HANG = 5;

export const TuongAnh: React.FC<{ c: CanhTuongAnh; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const lia = interpolate(f, [0, dur], [0, 1]);
  const noiBat = c.noiBat ?? [9, 11, 17, 23];
  const n = COT * HANG;
  return (
    <AbsoluteFill style={{ background: "#1a1a1a", perspective: 1400, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: -500,
          top: -380,
          width: 2900,
          height: 1850,
          display: "grid",
          gridTemplateColumns: `repeat(${COT}, 1fr)`,
          gap: 16,
          transformStyle: "preserve-3d",
          transform: `rotateX(38deg) rotateZ(${-14 + lia * 6}deg) translate(${-160 + lia * 260}px, ${lia * -120}px) scale(${1.05 + lia * 0.12})`,
        }}
      >
        {Array.from({ length: n }, (_, i) => {
          const src = c.anh.length ? c.anh[i % c.anh.length] : undefined;
          const noi = noiBat.includes(i);
          const len = noi ? interpolate(f, [10 + (i % 5) * 4, 30 + (i % 5) * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                overflow: "hidden",
                transform: `translateZ(${len * 80}px)`,
                boxShadow: noi ? `0 ${12 * len}px 0 ${MAU.xanhDoan}, 0 20px 40px rgba(0,0,0,${0.5 * len})` : "none",
                zIndex: noi ? 2 : 1,
              }}
            >
              <Media
                src={src}
                chuyenDong="dung-yen"
                thoiLuong={dur}
                locMau={`grayscale(${1 - len}) brightness(${0.75 + len * 0.25})`}
              />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
