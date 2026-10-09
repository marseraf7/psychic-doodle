import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CanhTuKhoa } from "../types";
import { NenDo } from "../thanh-phan/NenDo";
import { FONT_NGHIENG, FONT_TIEU_DE, MAU } from "../theme";

// Từ khóa: cột ô kính xanh ngọc trượt vào lần lượt, chữ nghiêng vàng–trắng gõ từng ký tự;
// bên phải là tranh minh họa (thanh niên cầm cờ…) hoặc để trống.
export const TuKhoa: React.FC<{ c: CanhTuKhoa; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const buoc = Math.max(10, Math.floor((dur * 0.55) / c.tuKhoa.length));
  const thuNho = interpolate(f, [dur - 25, dur], [1, 0.82], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <NenDo />
      <AbsoluteFill style={{ transform: `scale(${thuNho})`, transformOrigin: "35% 50%" }}>
        {c.bangRon && (
          <div
            style={{
              position: "absolute",
              left: 1250,
              top: 60,
              padding: "8px 26px",
              background: MAU.xanhDoan,
              color: MAU.trang,
              border: "3px solid white",
              fontFamily: FONT_TIEU_DE,
              fontWeight: 800,
              fontSize: 26,
            }}
          >
            {c.bangRon}
          </div>
        )}
        {c.anhMinhHoa && (
          <Img
            src={staticFile(c.anhMinhHoa)}
            style={{ position: "absolute", right: 60, bottom: 40, height: 860, objectFit: "contain" }}
          />
        )}
        <div style={{ position: "absolute", left: 80, top: 150, width: 820 }}>
          {c.tuKhoa.map((t, i) => {
            const bd = 8 + i * buoc;
            const p = spring({ frame: f - bd, fps, config: { damping: 15 } });
            const soKyTu = Math.floor(
              interpolate(f, [bd + 6, bd + 6 + t.length * 0.9], [0, t.length], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            );
            return (
              <div
                key={t}
                style={{
                  marginBottom: 34,
                  height: 128,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  background: `linear-gradient(180deg, ${MAU.xanhNgoc}EE 0%, ${MAU.xanhNgocDam}EE 100%)`,
                  border: "2px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.35)",
                  opacity: p,
                  transform: `translateX(${(1 - p) * -260}px)`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_NGHIENG,
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: 56,
                    letterSpacing: 1,
                    background: `linear-gradient(180deg, #FFFFFF 30%, ${MAU.vang} 100%)`,
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                    textTransform: "uppercase",
                    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))",
                  }}
                >
                  {t.slice(0, soKyTu)}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
