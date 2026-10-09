import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import kichBanJson from "./kich-ban.json";
import { Canh, KichBan } from "./types";
import { VaoCanh } from "./thanh-phan/ChuyenCanh";
import { MoDau } from "./canh/MoDau";
import { Footage } from "./canh/Footage";
import { VanBan } from "./canh/VanBan";
import { TuKhoa } from "./canh/TuKhoa";
import { SoLieu } from "./canh/SoLieu";
import { Chuong } from "./canh/Chuong";
import { LuoiAnh } from "./canh/LuoiAnh";
import { TuongAnh } from "./canh/TuongAnh";
import { Ket } from "./canh/Ket";

export const kichBan = kichBanJson as KichBan;

export const soKhung = (c: Canh, fps: number) => Math.max(1, Math.round(c.giay * fps));

const VeCanh: React.FC<{ c: Canh; dur: number }> = ({ c, dur }) => {
  switch (c.loai) {
    case "mo-dau":
      return <MoDau c={c} dur={dur} />;
    case "footage":
      return <Footage c={c} dur={dur} />;
    case "van-ban":
      return <VanBan c={c} dur={dur} />;
    case "tu-khoa":
      return <TuKhoa c={c} dur={dur} />;
    case "so-lieu":
      return <SoLieu c={c} dur={dur} />;
    case "chuong":
      return <Chuong c={c} dur={dur} />;
    case "luoi-anh":
      return <LuoiAnh c={c} dur={dur} />;
    case "tuong-anh":
      return <TuongAnh c={c} dur={dur} />;
    case "ket":
      return <Ket c={c} dur={dur} />;
  }
};

export const Video: React.FC = () => {
  const { meta, canh } = kichBan;
  const amLuongNhac = meta.amLuongNhac ?? (meta.loiDan ? 0.18 : 0.6);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        {canh.map((c, i) => {
          const dur = soKhung(c, meta.fps);
          return (
            <Series.Sequence key={i} durationInFrames={dur} name={`${i + 1}. ${c.loai}`}>
              <VaoCanh kieu={c.chuyen}>
                <VeCanh c={c} dur={dur} />
              </VaoCanh>
            </Series.Sequence>
          );
        })}
      </Series>
      {meta.loiDan && <Audio src={staticFile(meta.loiDan)} />}
      {meta.nhacNen && <Audio src={staticFile(meta.nhacNen)} volume={amLuongNhac} />}
    </AbsoluteFill>
  );
};
