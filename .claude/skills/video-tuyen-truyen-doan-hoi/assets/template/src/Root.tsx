import { Composition } from "remotion";
import { Video, kichBan, soKhung } from "./Video";

export const RemotionRoot: React.FC = () => {
  const { meta, canh } = kichBan;
  const tong = canh.reduce((s, c) => s + soKhung(c, meta.fps), 0);
  return (
    <Composition
      id="Video"
      component={Video}
      durationInFrames={tong}
      fps={meta.fps}
      width={meta.rong}
      height={meta.cao}
    />
  );
};
