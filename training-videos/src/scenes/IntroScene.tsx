import { Audio } from "@remotion/media";
import { AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";

import { CaptionTrack } from "../Captions";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#0b261e", color: "#ffffff", fontFamily: "Inter, Arial, sans-serif" }}>
      <Audio from={15} src={staticFile("voiceover/01-intro.wav")} volume={0.95} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "linear-gradient(rgba(176,207,194,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(176,207,194,.25) 1px, transparent 1px)", backgroundSize: "68px 68px" }} />
      <div style={{ position: "absolute", width: 900, height: 900, right: -250, top: -260, borderRadius: "50%", backgroundColor: "rgba(85,224,161,.14)", filter: "blur(110px)" }} />
      <div style={{ position: "absolute", right: 55, bottom: 135, width: 930, height: 420, opacity: 0.62 }}>
        <i style={{ position: "absolute", width: 330, height: 9, left: 70, top: 250, borderRadius: 99, backgroundColor: "#dafa58", rotate: "-12deg", boxShadow: "0 0 24px rgba(218,250,88,.55)" }} />
        <i style={{ position: "absolute", width: 315, height: 9, left: 387, top: 183, borderRadius: 99, backgroundColor: "#dafa58", rotate: "-9deg", boxShadow: "0 0 24px rgba(218,250,88,.55)" }} />
        <i style={{ position: "absolute", width: 265, height: 9, left: 685, top: 145, borderRadius: 99, backgroundColor: "#dafa58", rotate: "21deg", boxShadow: "0 0 24px rgba(218,250,88,.55)" }} />
        {[{ left: 58, top: 260, label: "A" }, { left: 376, top: 198, label: "2" }, { left: 680, top: 157, label: "3" }, { left: 927, top: 245, label: "B" }].map((pin) => <b key={pin.label} style={{ position: "absolute", left: pin.left, top: pin.top, width: 38, height: 38, border: "4px solid #ffffff", borderRadius: "50%", backgroundColor: pin.label === "2" || pin.label === "3" ? "#dafa58" : "#1b7256", color: pin.label === "2" || pin.label === "3" ? "#173024" : "#ffffff", display: "grid", placeItems: "center", fontSize: 14, boxShadow: "0 6px 20px rgba(0,0,0,.28)" }}>{pin.label}</b>)}
      </div>

      <Interactive.Div
        name="TruckProfit logo"
        style={{
          position: "absolute",
          top: 155,
          left: 115,
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
          scale: interpolate(frame, [0, 26], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }), output: "perceptual-scale" }),
        }}
      >
        <CanvasImage src={staticFile("assets/truckprofit-bot-avatar.png")} style={{ width: 110, height: 110, borderRadius: 31 }} />
        <span style={{ fontSize: 58, fontWeight: 900, letterSpacing: -3 }}>TruckProfit</span>
      </Interactive.Div>

      <Interactive.Div
        name="Intro title"
        style={{
          position: "absolute",
          top: 335,
          left: 115,
          width: 1380,
          opacity: interpolate(frame, [12, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
          translate: interpolate(frame, [12, 34], ["0px 35px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        <p style={{ margin: 0, color: "#a7bcb2", fontSize: 24, fontWeight: 800, letterSpacing: 3.2, textTransform: "uppercase" }}>Обучающий ролик · 01</p>
        <h1 style={{ margin: "25px 0 0", fontSize: 112, lineHeight: 0.96, letterSpacing: -7.5 }}>Первый рейс:<br /><span style={{ color: "#dafa58" }}>от создания до отчёта</span></h1>
      </Interactive.Div>

      <CaptionTrack scene="intro" />
    </AbsoluteFill>
  );
};
