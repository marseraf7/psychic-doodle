import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CanhChuong } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { BONG_CHU, FONT_TIEU_DE, MAU } from "../theme";

// Thẻ chuyển chương: một dòng chữ lớn giữa nền đỏ; khi rời cảnh, chữ vụt sang ngang
// kèm các vòng xoáy trắng (whip transition) như đoạn "16 NỘI DUNG, GIẢI PHÁP" trong video mẫu.
export const Chuong: React.FC<{ c: CanhChuong; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const vao = interpolate(f, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ra = interpolate(f, [dur - 16, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <NenDo />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontFamily: FONT_TIEU_DE,
            fontWeight: 900,
            fontSize: 96,
            color: MAU.trang,
            textShadow: BONG_CHU,
            letterSpacing: interpolate(vao, [0, 1], [30, 2]),
            opacity: vao,
            transform: `translateX(${ra * -900}px) scaleX(${1 + ra * 0.8})`,
            filter: `blur(${ra * 18}px)`,
            textTransform: "uppercase",
          }}
        >
          {c.chu}
        </div>
      </AbsoluteFill>
      {ra > 0 &&
        [380, 620, 860].map((r, i) => (
          <div
            key={r}
            style={{
              position: "absolute",
              left: 960 - r / 2,
              top: 540 - r / 2,
              width: r,
              height: r,
              borderRadius: "50%",
              border: `${26 - i * 6}px solid rgba(255,255,255,${0.9 * ra})`,
              borderRightColor: "transparent",
              borderBottomColor: "transparent",
              transform: `rotate(${ra * 400 + i * 120}deg) scale(${0.6 + ra * 0.6})`,
            }}
          />
        ))}
    </AbsoluteFill>
  );
};
