import type { Caption } from "@remotion/captions";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import captionData from "../public/captions.json";

type CaptionFile = Record<string, Caption[]>;

export const CaptionTrack: React.FC<{ scene: string }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const captions = captionData as CaptionFile;

  const currentTimeMs = (frame / fps) * 1000;
  const active = captions[scene]?.find((caption) => caption.startMs <= currentTimeMs && caption.endMs > currentTimeMs);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ zIndex: 50, pointerEvents: "none", justifyContent: "flex-end", alignItems: "center", paddingBottom: 80 }}>
      <div
        style={{
          maxWidth: 1460,
          minHeight: 76,
          padding: "17px 32px",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: 18,
          backgroundColor: "rgba(8,24,18,.92)",
          color: "#ffffff",
          boxShadow: "0 16px 44px rgba(0,0,0,.22)",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 34,
          fontWeight: 720,
          lineHeight: 1.25,
          textAlign: "center",
          opacity: interpolate(frame, [0, 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
