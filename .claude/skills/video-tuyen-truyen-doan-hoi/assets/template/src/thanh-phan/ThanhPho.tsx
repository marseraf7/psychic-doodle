import { interpolate, useCurrentFrame, Easing } from "remotion";
import { MAU } from "../theme";

// Đường chân trời thành phố vàng kim mọc lên từ đáy khung (cảnh mở đầu và kết).
// Chiều cao các tòa nhà cố định (không ngẫu nhiên) để mỗi lần render giống hệt nhau.
const NHA = [90, 140, 70, 200, 120, 260, 160, 330, 210, 420, 260, 360, 180, 300, 140, 230, 100, 170, 80, 130];

export const ThanhPho: React.FC<{ batDau?: number }> = ({ batDau = 0 }) => {
  const frame = useCurrentFrame();
  const w = 1100 / NHA.length;
  return (
    <div style={{ position: "absolute", left: 410, bottom: 70, width: 1100, height: 440 }}>
      {NHA.map((h, i) => {
        const tre = batDau + Math.abs(i - NHA.length / 2) * 2;
        const p = interpolate(frame, [tre, tre + 28], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: i * w + 4,
              width: w - 8,
              height: h * p,
              background: `linear-gradient(180deg, ${MAU.vang} 0%, ${MAU.vangKim} 45%, rgba(255,140,0,0.15) 100%)`,
              opacity: 0.9,
              boxShadow: `0 0 24px ${MAU.vangKim}88`,
            }}
          >
            {h === 420 && (
              // Chóp nhọn cho tòa nhà cao nhất, gợi hình tòa tháp biểu tượng.
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  width: 6,
                  height: 90 * p,
                  marginLeft: -3,
                  background: MAU.vang,
                }}
              />
            )}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          bottom: -6,
          left: -200,
          right: -200,
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(90deg, transparent, ${MAU.vang}, transparent)`,
          boxShadow: `0 0 30px ${MAU.vang}`,
          opacity: interpolate(frame, [batDau, batDau + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      />
    </div>
  );
};
