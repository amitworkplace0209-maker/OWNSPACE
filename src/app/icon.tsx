import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          borderRadius: "25%",
          fontFamily: "sans-serif",
          fontWeight: 700,
          color: "#f5f8ff",
          fontSize: 22,
        }}
      >
        O
      </div>
    ),
    size
  );
}