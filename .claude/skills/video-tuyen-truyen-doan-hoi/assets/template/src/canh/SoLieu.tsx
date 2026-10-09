import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhSoLieu } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { Media } from "../thanh-phan/Media";
import { OVuong } from "../thanh-phan/OVuong";
import { BONG_CHU, FONT_TIEU_DE, MAU } from "../theme";

// Số liệu: năm viết viền rỗng góc trái trên, ảnh hoạt động trong khung viền trắng kép trượt vào,
// con số đếm lên, chú thích in hoa bên dưới, ô vuông trắng trôi lơ lửng.
export const SoLieu: React.FC<{ c: CanhSoLieu; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anh = spring({ frame: f, fps, config: { damping: 18 } });
  const dem = interpolate(f, [10, 40], [0, c.so], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const so = spring({ frame: f - 10, fps, config: { damping: 12 } });
  const chu = interpolate(f, [22, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const nhoe = (1 - anh) * 30;

  return (
    <AbsoluteFill>
      <NenDo />
      <div style={{ position: "absolute", inset: 0, opacity: 0.25, filter: "blur(8px)" }}>
        <div style={{ position: "absolute", right: -60, top: 80, width: 520, height: 300, overflow: "hidden" }}>
          <Media src={c.anh} chuyenDong="lia-trai" thoiLuong={dur} />
        </div>
        <div style={{ position: "absolute", left: 80, bottom: 120, width: 420, height: 240, overflow: "hidden" }}>
          <Media src={c.anh} chuyenDong="lia-phai" thoiLuong={dur} />
        </div>
      </div>
      {c.nam && (
        <div
          style={{
            position: "absolute",
            left: 60,
            top: 20,
            fontFamily: FONT_TIEU_DE,
            fontWeight: 900,
            fontSize: 230,
            color: "transparent",
            WebkitTextStroke: "3px rgba(255,255,255,0.85)",
            letterSpacing: -4,
          }}
        >
          {c.nam}
        </div>
      )}
      <OVuong />
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 170,
          width: 1080,
          height: 600,
          transform: `translateX(${(1 - anh) * 700}px)`,
          filter: `blur(${nhoe}px)`,
        }}
      >
        <div style={{ position: "absolute", inset: -26, border: "2px solid rgba(255,255,255,0.7)", transform: "translate(40px,-20px)" }} />
        <div style={{ position: "absolute", inset: 0, border: "6px solid white", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
          <Media src={c.anh} chuyenDong="zoom-vao" thoiLuong={dur} />
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: "center", top: 690 }}>
        <div
          style={{
            fontFamily: FONT_TIEU_DE,
            fontWeight: 900,
            fontSize: 140,
            color: MAU.trang,
            lineHeight: 1,
            textShadow: BONG_CHU,
            transform: `scale(${0.6 + so * 0.4})`,
            opacity: so,
          }}
        >
          {Math.round(dem)}
          {c.donVi ?? ""}
        </div>
        <div
          style={{
            marginTop: 14,
            maxWidth: 1400,
            textAlign: "center",
            fontFamily: FONT_TIEU_DE,
            fontWeight: 800,
            fontSize: 44,
            lineHeight: 1.25,
            color: MAU.trang,
            textShadow: BONG_CHU,
            textTransform: "uppercase",
            opacity: chu,
            clipPath: `inset(0 ${(1 - chu) * 100}% 0 0)`,
          }}
        >
          {c.chuThich}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
