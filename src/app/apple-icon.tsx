import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#17352c",
          color: "#f4f1e8",
          display: "flex",
          fontFamily: "sans-serif",
          fontSize: 102,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.08em",
          paddingRight: 8,
          width: "100%",
        }}
      >
        M
      </div>
    ),
    size,
  );
}
