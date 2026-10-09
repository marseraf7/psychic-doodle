import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhMoDau } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { ThanhPho } from "../thanh-phan/ThanhPho";
import { BieuTuong } from "../thanh-phan/BieuTuong";
import { BONG_CHU, FONT_TIEU_DE, MAU } from "../theme";

// Mở đầu: biểu tượng → tiêu đề vụt vào có nhòe chuyển động → thành phố vàng mọc lên
// → cuối cảnh chữ phóng to lao về phía người xem (zoom-blur) để cắt sang footage.
export const MoDau: React.FC<{ c: CanhMoDau; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 6, fps, config: { damping: 14 } });
  const chu = interpolate(f, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ra = interpolate(f, [dur - 14, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <NenDo />
      <ThanhPho batDau={40} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          paddingTop: 110,
          transform: `scale(${1 + ra * 2.2})`,
          filter: `blur(${ra * 14}px)`,
          opacity: 1 - ra * 0.6,
        }}
      >
        <div style={{ display: "flex", gap: 40, transform: `scale(${logo})`, opacity: logo }}>
          {(c.bieuTuong?.length ? c.bieuTuong : [undefined]).map((b, i) => (
            <BieuTuong key={i} src={b} cao={150} />
          ))}
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: FONT_TIEU_DE,
            fontWeight: 900,
            fontSize: 104,
            color: MAU.trang,
            textShadow: BONG_CHU,
            letterSpacing: 2,
            opacity: chu,
            transform: `translateX(${(1 - chu) * -300}px) scaleX(${1 + (1 - chu) * 0.6})`,
            filter: `blur(${(1 - chu) * 16}px)`,
          }}
        >
          {c.tieuDe}
        </div>
        {c.phuDe && (
          <div
            style={{
              marginTop: 6,
              fontFamily: FONT_TIEU_DE,
              fontWeight: 800,
              fontSize: 36,
              color: MAU.trang,
              textShadow: BONG_CHU,
              letterSpacing: 1,
              opacity: chu,
              transform: `translateX(${(1 - chu) * 300}px)`,
              filter: `blur(${(1 - chu) * 16}px)`,
            }}
          >
            {c.phuDe}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
