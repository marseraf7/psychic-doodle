import { Img, staticFile } from "remotion";
import { MAU } from "../theme";

// Logo chính thức (PNG nền trong). Chưa có file thì vẽ ngôi sao vàng giữ chỗ — KHÔNG tự vẽ lại huy hiệu.
export const BieuTuong: React.FC<{ src?: string; cao: number }> = ({ src, cao }) => {
  if (src) return <Img src={staticFile(src)} style={{ height: cao, objectFit: "contain" }} />;
  return (
    <svg height={cao} viewBox="0 0 100 100">
      <polygon
        points="50,5 61,38 96,38 68,59 79,93 50,72 21,93 32,59 4,38 39,38"
        fill={MAU.vang}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={2}
      />
    </svg>
  );
};
