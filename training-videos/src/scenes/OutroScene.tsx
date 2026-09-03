import { Audio } from "@remotion/media";
import { AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";

import { CaptionTrack } from "../Captions";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#0b261e", color: "#ffffff", fontFamily: "Inter, Arial, sans-serif" }}>
      <Audio from={15} src={staticFile("voiceover/08-outro.wav")} volume={0.95} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.1, backgroundImage: "linear-gradient(rgba(176,207,194,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(176,207,194,.25) 1px, transparent 1px)", backgroundSize: "68px 68px" }} />
      <div style={{ position: "absolute", width: 900, height: 900, left: 510, top: 120, borderRadius: "50%", backgroundColor: "rgba(96,230,169,.13)", filter: "blur(115px)" }} />
      <div style={{ position: "absolute", top: 115, left: 115, color: "#9db2a8", fontSize: 20, fontWeight: 800, letterSpacing: 2.5 }}>ОБУЧЕНИЕ · TRUCKPROFIT</div>

      <Interactive.Div
        name="Outro message"
        style={{
          position: "absolute",
          top: 245,
          left: 115,
          width: 1300,
          opacity: interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
          translate: interpolate(frame, [0, 28], ["0px 35px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        <p style={{ margin: 0, color: "#b1c3ba", fontSize: 29, lineHeight: 1.4 }}>От водителя — владельцу.<br />От факта — к решению.</p>
        <h1 style={{ margin: "35px 0 0", fontSize: 107, lineHeight: 0.98, letterSpacing: -7 }}>Прибыль каждого рейса<br /><span style={{ color: "#dafa58" }}>под контролем.</span></h1>
      </Interactive.Div>

      <div style={{ position: "absolute", right: 130, top: 125, width: 250, height: 250, padding: 18, border: "1px solid rgba(218,250,88,.23)", borderRadius: 58, backgroundColor: "rgba(255,255,255,.045)", opacity: interpolate(frame, [20, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), scale: interpolate(frame, [20, 45], [0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 180 }), output: "perceptual-scale" }) }}><CanvasImage src={staticFile("assets/truckprofit-bot-avatar.png")} style={{ width: 214, height: 214, borderRadius: 42 }} /></div>
      <div style={{ position: "absolute", left: 115, bottom: 200, display: "flex", gap: 13 }}><span style={{ padding: "15px 20px", borderRadius: 12, backgroundColor: "#dafa58", color: "#173024", fontSize: 18, fontWeight: 850 }}>fleet-economics.vercel.app</span><span style={{ padding: "15px 20px", border: "1px solid #49685b", borderRadius: 12, color: "#c3d2cb", fontSize: 18, fontWeight: 750 }}>Поддержка внутри кабинета</span></div>
      <CaptionTrack scene="outro" />
    </AbsoluteFill>
  );
};
