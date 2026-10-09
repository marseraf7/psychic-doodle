import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_TIEU_DE } from "../theme";

type ChuyenDong = "zoom-vao" | "zoom-ra" | "lia-trai" | "lia-phai" | "dung-yen";

// Ảnh hoặc video lấp đầy khung, có hiệu ứng Ken Burns. Thiếu nguồn thì hiện khung giữ chỗ.
export const Media: React.FC<{
  src?: string;
  chuyenDong?: ChuyenDong;
  thoiLuong?: number;
  locMau?: string;
  nhan?: string;
}> = ({ src, chuyenDong = "zoom-vao", thoiLuong, locMau, nhan }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const d = thoiLuong ?? durationInFrames;
  const p = interpolate(frame, [0, d], [0, 1], { extrapolateRight: "clamp" });
  const s =
    chuyenDong === "zoom-vao" ? 1.04 + p * 0.1 : chuyenDong === "zoom-ra" ? 1.14 - p * 0.1 : 1.12;
  const x = chuyenDong === "lia-trai" ? 40 - p * 80 : chuyenDong === "lia-phai" ? -40 + p * 80 : 0;
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `scale(${s}) translateX(${x}px)`,
    filter: locMau,
  };

  if (!src) {
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, #2b3a55, #51627f)",
          justifyContent: "center",
          alignItems: "center",
          color: "rgba(255,255,255,0.75)",
          fontFamily: FONT_TIEU_DE,
          fontWeight: 600,
          fontSize: 34,
          textAlign: "center",
          filter: locMau,
        }}
      >
        <div style={{ transform: `scale(${s})` }}>
          [ ẢNH / VIDEO ]
          {nhan && <div style={{ fontSize: 24, marginTop: 10, opacity: 0.8 }}>{nhan}</div>}
        </div>
      </AbsoluteFill>
    );
  }
  const laVideo = /\.(mp4|webm|mov|m4v)$/i.test(src);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {laVideo ? (
        <OffthreadVideo src={staticFile(src)} muted style={style} />
      ) : (
        <Img src={staticFile(src)} style={style} />
      )}
    </AbsoluteFill>
  );
};
