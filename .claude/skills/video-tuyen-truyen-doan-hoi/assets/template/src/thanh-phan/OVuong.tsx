import { useCurrentFrame } from "remotion";

// Các ô vuông trắng nhỏ trôi lơ lửng (chi tiết trang trí ở cảnh số liệu).
const O = [
  { x: 330, y: 230, s: 22, a: 0.9 },
  { x: 1390, y: 300, s: 18, a: 0.9 },
  { x: 1500, y: 520, s: 44, a: 0.35 },
  { x: 520, y: 780, s: 40, a: 0.3 },
  { x: 1600, y: 760, s: 14, a: 0.8 },
  { x: 230, y: 640, s: 12, a: 0.7 },
  { x: 1240, y: 160, s: 30, a: 0.25 },
];

export const OVuong: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {O.map((o, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: o.x + Math.sin((f + i * 20) / 40) * 12,
            top: o.y + Math.cos((f + i * 15) / 50) * 10,
            width: o.s,
            height: o.s,
            background: `rgba(255,255,255,${o.a})`,
          }}
        />
      ))}
    </>
  );
};
