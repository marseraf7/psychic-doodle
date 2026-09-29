import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { TitleScene } from "./TitleScene";
import { OrgChartScene, CHART } from "./OrgChartScene";
import { OutroScene } from "./OutroScene";

export const TITLE_LEN = 120;
export const OUTRO_LEN = 100;
export const TOTAL = TITLE_LEN + CHART.duration + OUTRO_LEN;

export const Video: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Sequence durationInFrames={TITLE_LEN}>
      <TitleScene />
    </Sequence>
    <Sequence from={TITLE_LEN} durationInFrames={CHART.duration}>
      <OrgChartScene />
    </Sequence>
    <Sequence from={TITLE_LEN + CHART.duration} durationInFrames={OUTRO_LEN}>
      <OutroScene />
    </Sequence>
  </AbsoluteFill>
);
