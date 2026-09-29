import { Composition } from "remotion";
import { Video, TOTAL } from "./Video";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="SoDoToChuc"
    component={Video}
    durationInFrames={TOTAL}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
