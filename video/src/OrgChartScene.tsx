import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from "remotion";
import { COLORS } from "./theme";
import { Branch, DOAN_STATS, HOI_STATS, NODES } from "./data";
import { OrgNodeBox } from "./components/OrgNodeBox";
import { Edges } from "./components/Edges";
import { StatPanel } from "./components/StatPanel";

// Mốc thời gian của cảnh (khung hình, 30 fps).
export const CHART = {
  focusDoan: 210,
  focusHoi: 390,
  back: 570,
  duration: 640,
};
const T = 24; // khung hình chuyển máy quay

type Cam = { s: number; cx: number; cy: number; tx: number; ty: number };
const FULL: Cam = { s: 1, cx: 960, cy: 540, tx: 960, ty: 540 };
const DOAN: Cam = { s: 1.2, cx: 500, cy: 560, tx: 560, ty: 560 };
const HOI: Cam = { s: 1.2, cx: 1420, cy: 560, tx: 1360, ty: 560 };

const lerpCam = (frame: number): Cam => {
  const keys: [number, Cam][] = [
    [CHART.focusDoan, FULL],
    [CHART.focusDoan + T, DOAN],
    [CHART.focusHoi, DOAN],
    [CHART.focusHoi + T, HOI],
    [CHART.back, HOI],
    [CHART.back + T, FULL],
  ];
  const at = (k: keyof Cam) =>
    interpolate(frame, keys.map((x) => x[0]), keys.map((x) => x[1][k]), {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
  return { s: at("s"), cx: at("cx"), cy: at("cy"), tx: at("tx"), ty: at("ty") };
};

export const OrgChartScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = lerpCam(frame);

  // Làm mờ nhánh không được nhắc tới khi đang tập trung vào một nhánh.
  const ramp = (a: number, b: number) =>
    interpolate(frame, [a, a + T, b, b + T], [1, 0.06, 0.06, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const dimFor = (b: Branch) =>
    b === "hoi" ? ramp(CHART.focusDoan, CHART.focusHoi) : b === "doan" ? ramp(CHART.focusHoi, CHART.back) : 1;

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${cam.tx - cam.cx * cam.s}px, ${cam.ty - cam.cy * cam.s}px) scale(${cam.s})`,
        }}
      >
        <Edges dimFor={dimFor} />
        {NODES.map((n) => (
          <OrgNodeBox key={n.id} node={n} dim={dimFor(n.branch)} />
        ))}
      </AbsoluteFill>

      <Sequence from={CHART.focusDoan} durationInFrames={CHART.focusHoi - CHART.focusDoan + 10}>
        <StatPanel
          side="right"
          heading="Ban Cán sự Đoàn tại LB Nga"
          color={COLORS.doan}
          stats={DOAN_STATS}
          durationInFrames={CHART.focusHoi - CHART.focusDoan + 10}
        />
      </Sequence>
      <Sequence from={CHART.focusHoi} durationInFrames={CHART.back - CHART.focusHoi + 10}>
        <StatPanel
          side="left"
          heading="Hội Sinh viên Việt Nam tại Nga"
          color={COLORS.hoi}
          stats={HOI_STATS}
          durationInFrames={CHART.back - CHART.focusHoi + 10}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
