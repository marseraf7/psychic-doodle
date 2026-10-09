import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CanhFootage } from "../types";
import { Media } from "../thanh-phan/Media";
import { BONG_CHU, FONT_TIEU_DE, MAU } from "../theme";

// Một cú máy tư liệu (ảnh/video thật). Video mẫu cắt nhanh 1–3 giây mỗi cú, luôn có chuyển động nhẹ.
export const Footage: React.FC<{ c: CanhFootage; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const chu = interpolate(f, [0, dur], [200, -200]);
  return (
    <AbsoluteFill>
      <Media src={c.nguon} chuyenDong={c.chuyenDong ?? "zoom-vao"} thoiLuong={dur} nhan={c.ghiChu} />
      {c.chuTren && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              fontFamily: FONT_TIEU_DE,
              fontWeight: 900,
              fontSize: 120,
              color: MAU.trang,
              opacity: 0.55,
              textShadow: BONG_CHU,
              transform: `translateX(${chu}px)`,
              whiteSpace: "nowrap",
            }}
          >
            {c.chuTren}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
