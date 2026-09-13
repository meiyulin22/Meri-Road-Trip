import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#17352c",
          color: "#f4f1e8",
          display: "flex",
          fontFamily: "sans-serif",
          fontSize: 292,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.08em",
          paddingRight: 22,
          width: "100%",
        }}
      >
        M
      </div>
    ),
    size,
  );
}
