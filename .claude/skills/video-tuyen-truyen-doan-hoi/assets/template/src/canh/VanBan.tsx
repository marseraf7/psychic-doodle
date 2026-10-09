import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhVanBan } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { BieuTuong } from "../thanh-phan/BieuTuong";
import { BONG_CHU, FONT_TIEU_DE, MAU } from "../theme";

const Trang: React.FC<{ dong: string[]; toSang: number[]; sang: number }> = ({ dong, toSang, sang }) => (
  <div
    style={{
      width: 1500,
      minHeight: 2120, // khổ A4 dọc để trang luôn phủ kín khung ở pha cận cảnh
      padding: "90px 100px",
      background: "#FBFBF8",
      fontFamily: "'Times New Roman', serif",
      fontSize: 38,
      lineHeight: 1.45,
      color: "#1b1b1b",
      textAlign: "justify",
    }}
  >
    {dong.map((d, i) => {
      const noi = toSang.includes(i);
      return (
        <p
          key={i}
          style={{
            margin: "0 0 18px",
            fontWeight: noi ? 700 : 400,
            opacity: noi ? 1 : 1 - sang * 0.55,
            background: noi ? `rgba(255,255,255,${sang})` : "transparent",
            boxShadow: noi ? `0 0 ${50 * sang}px ${30 * sang}px rgba(255,255,255,${0.95 * sang})` : "none",
            position: "relative",
            zIndex: noi ? 2 : 1,
          }}
        >
          {d}
        </p>
      );
    })}
  </div>
);

// Văn bản: pha 1 trang giấy bay vào cạnh logo + tên văn bản trên nền đỏ;
// pha 2 cận cảnh trang giấy, phần còn lại tối xám, đoạn quan trọng được "soi sáng".
export const VanBan: React.FC<{ c: CanhVanBan; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tach = Math.round(dur * 0.42);

  if (f < tach) {
    const bay = spring({ frame: f, fps, config: { damping: 18, mass: 1.2 } });
    const chu = spring({ frame: f - 10, fps, config: { damping: 16 } });
    return (
      <AbsoluteFill>
        <NenDo />
        <div
          style={{
            position: "absolute",
            left: 230,
            top: 90,
            transformOrigin: "0 0",
            transform: `perspective(1600px) translate(${(1 - bay) * -500}px, ${(1 - bay) * 200}px) rotateY(${(1 - bay) * 50 + 12}deg) rotateZ(${(1 - bay) * -25 - 4}deg) scale(0.42)`,
            boxShadow: "0 30px 60px rgba(0,0,0,0.35)",
          }}
        >
          <Trang dong={c.dong} toSang={c.toSang} sang={0} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 1000,
            width: 800,
            top: 300,
            textAlign: "center",
            opacity: chu,
            transform: `translateX(${(1 - chu) * 120}px)`,
          }}
        >
          <BieuTuong src={c.logo} cao={170} />
          <div
            style={{
              marginTop: 24,
              fontFamily: FONT_TIEU_DE,
              fontWeight: 800,
              fontSize: 40,
              lineHeight: 1.3,
              color: MAU.trang,
              textShadow: BONG_CHU,
              textTransform: "uppercase",
            }}
          >
            {c.tieuDe}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const g = f - tach;
  const vao = interpolate(g, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sang = interpolate(g, [14, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lia = interpolate(g, [0, dur - tach], [0, -60]);
  // Ước lượng để đoạn nổi bật đầu tiên rơi gần giữa khung (mỗi đoạn ~2 dòng ≈ 150px sau phóng to).
  const dau = c.toSang.length ? Math.min(...c.toSang) : 0;
  const top = 330 - dau * 150;
  return (
    <AbsoluteFill style={{ background: `rgba(90,90,90,1)`, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 210, // tâm trang trùng tâm khung
          top: top + lia,
          transform: `perspective(1800px) rotateX(${(1 - vao) * 18 + 6}deg) rotateZ(-2deg) scale(${1.3 + vao * 0.06})`,
          transformOrigin: "50% 30%",
        }}
      >
        <Trang dong={c.dong} toSang={c.toSang} sang={sang} />
      </div>
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)" }}
      />
    </AbsoluteFill>
  );
};
