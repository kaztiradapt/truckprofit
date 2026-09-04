import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";

import { CaptionTrack } from "./Captions";

export const SceneBase: React.FC<{
  scene: string;
  audio: string;
  number: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  dark?: boolean;
}> = ({ scene, audio, number, eyebrow, title, children, dark = false }) => {
  const currentStep = Number(number);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: dark ? "#0b261e" : "#f4f6f2", color: dark ? "#ffffff" : "#14211c", fontFamily: "Inter, Arial, sans-serif" }}>
      <Audio from={15} src={staticFile(audio)} volume={0.95} />
      <div style={{ position: "absolute", inset: 0, opacity: dark ? 0.09 : 0.32, backgroundImage: "linear-gradient(rgba(84,116,103,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(84,116,103,.16) 1px, transparent 1px)", backgroundSize: "58px 58px" }} />
      <div style={{ position: "absolute", width: 620, height: 620, left: -260, top: -210, borderRadius: "50%", backgroundColor: dark ? "rgba(99,222,167,.14)" : "rgba(47,141,103,.08)", filter: "blur(90px)" }} />

      <Interactive.Div
        name={`${scene} heading`}
        style={{
          position: "absolute",
          zIndex: 2,
          top: 52,
          left: 96,
          width: 1080,
          opacity: 1,
        }}
      >
        <div style={{ color: dark ? "#a8bbb2" : "#60736a", display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase" }}>
          <span style={{ color: "#11271f", width: 40, height: 40, borderRadius: 12, backgroundColor: "#dafa58", display: "grid", placeItems: "center", fontSize: 14 }}>{number}</span>
          {eyebrow}
        </div>
        <h1 style={{ margin: "12px 0 0", fontSize: 49, lineHeight: 0.96, letterSpacing: -3.2 }}>{title}</h1>
      </Interactive.Div>

      <div style={{ position: "absolute", zIndex: 2, top: 52, right: 96, display: "flex", alignItems: "center", gap: 12, color: dark ? "#c8d7d0" : "#18342a", fontSize: 20, fontWeight: 850 }}>
        <CanvasImage src={staticFile("assets/truckprofit-bot-avatar.png")} style={{ width: 40, height: 40, borderRadius: 12 }} />
        TruckProfit
      </div>

      <div style={{ position: "absolute", zIndex: 2, top: 122, right: 96, display: "flex", alignItems: "center", gap: 13, color: dark ? "#9fb5ab" : "#63756c", fontSize: 12, fontWeight: 850, letterSpacing: 1.3 }}>
        <span>ШАГ {currentStep} ИЗ 6</span>
        <span style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: 6 }, (_, index) => <i key={index} style={{ width: index + 1 === currentStep ? 30 : 9, height: 9, borderRadius: 99, backgroundColor: index + 1 <= currentStep ? "#dafa58" : dark ? "#33554a" : "#d5ddd9" }} />)}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: 225,
          left: 140,
          width: 1640,
          height: 685,
          opacity: 1,
          scale: 1,
        }}
      >
        {children}
      </div>
      <CaptionTrack scene={scene} />
    </AbsoluteFill>
  );
};

export const AppWindow: React.FC<{ active: string; title: string; children: ReactNode; badge?: string }> = ({ active, title, children, badge }) => {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", border: "1px solid #b9c9c1", borderRadius: 22, backgroundColor: "#f7f8f5", boxShadow: "0 32px 80px rgba(20,50,38,.22)", display: "grid", gridTemplateRows: "44px 1fr" }}>
      <div style={{ padding: "0 18px", backgroundColor: "#101d18", color: "#82948c", display: "grid", gridTemplateColumns: "1fr 2fr 1fr", alignItems: "center", fontSize: 12 }}>
        <span style={{ display: "flex", gap: 7 }}><i style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "#dc7653" }} /><i style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "#e7bb54" }} /><i style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "#61b578" }} /></span>
        <span style={{ justifySelf: "center", padding: "7px 55px", borderRadius: 8, backgroundColor: "#1d2e27" }}>fleet-economics.vercel.app/dashboard</span>
        <span style={{ justifySelf: "end", letterSpacing: 3 }}>•••</span>
      </div>
      <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "205px 1fr" }}>
        <aside style={{ padding: "22px 18px", backgroundColor: "#112a21", color: "#a3b3ac", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ marginBottom: 20, color: "#ffffff", display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 850 }}><span style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#dafa58", color: "#173024", display: "grid", placeItems: "center", fontSize: 12 }}>TP</span>TruckProfit</div>
          {["Обзор", "Рейсы", "Автомобили", "Водители", "Отчёты", "Расходы", "Сотрудники", "Создание рейса"].map((item) => <span key={item} style={{ padding: "9px 12px", borderRadius: 8, backgroundColor: item === active ? "#294238" : "transparent", color: item === active ? "#ffffff" : "#a3b3ac", fontSize: 14, fontWeight: item === active ? 750 : 500 }}>{item}</span>)}
          <small style={{ marginTop: "auto", padding: "15px 10px 0", borderTop: "1px solid #385047", color: "#82958d", fontSize: 10, lineHeight: 1.6 }}>DEMO TRANS<br />3 авто · KZT</small>
        </aside>
        <section style={{ minWidth: 0, padding: "24px 30px", overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
            <div><small style={{ color: "#718079", fontSize: 10, fontWeight: 800, letterSpacing: 1.4 }}>ЭКОНОМИКА АВТОПАРКА</small><h2 style={{ margin: "4px 0 0", fontSize: 30, letterSpacing: -1.5 }}>{title}</h2></div>
            {badge ? <span style={{ padding: "8px 12px", borderRadius: 999, backgroundColor: "#e5f3ec", color: "#176d50", fontSize: 11, fontWeight: 800 }}>{badge}</span> : null}
          </header>
          <div style={{ marginTop: 18 }}>{children}</div>
        </section>
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; value: string; width?: number; active?: boolean }> = ({ label, value, width, active = false }) => (
  <label style={{ width: width ?? "100%", display: "grid", gap: 7, color: "#5e6b65", fontSize: 10, fontWeight: 800 }}>
    {label}
    <span style={{ minHeight: 48, padding: "13px 14px", border: `1px solid ${active ? "#187054" : "#cbd6d0"}`, borderRadius: 10, backgroundColor: "#ffffff", color: value ? "#17211d" : "#9ca6a1", boxShadow: active ? "0 0 0 4px rgba(24,112,84,.12)" : "none", fontSize: 13, fontWeight: 650 }}>{value || "Не выбрано"}</span>
  </label>
);

export type CursorStop = {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
  label?: string;
};

export const GuidedCursor: React.FC<{ stops: CursorStop[] }> = ({ stops }) => {
  const frame = useCurrentFrame();
  const first = stops[0];

  if (!first) {
    return null;
  }

  let x = first.x;
  let y = first.y;
  let settledStop = first;

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];
    const travelStart = next.frame - 18;

    if (frame < travelStart) {
      settledStop = previous;
      break;
    }

    if (frame <= next.frame) {
      x = interpolate(frame, [travelStart, next.frame], [previous.x, next.x], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
      y = interpolate(frame, [travelStart, next.frame], [previous.y, next.y], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
      settledStop = next;
      break;
    }

    x = next.x;
    y = next.y;
    settledStop = next;
  }

  const clickStop = stops.find((stop) => stop.click && frame >= stop.frame - 2 && frame <= stop.frame + 13);
  const clickProgress = clickStop ? frame - clickStop.frame : -1;
  const clickScale = clickStop
    ? interpolate(clickProgress, [-2, 2, 13], [0.5, 0.82, 1.5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    })
    : 1;
  const clickOpacity = clickStop
    ? interpolate(clickProgress, [-2, 1, 13], [0, 0.9, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
    : 0;
  const labelVisible = Boolean(settledStop.label) && frame >= settledStop.frame && frame <= settledStop.frame + 34;

  return (
    <>
      {stops.filter((stop) => stop.click).map((stop) => <Audio key={`click-${stop.frame}`} from={stop.frame} durationInFrames={10} src={staticFile("sfx/mouse-click.wav")} volume={0.16} />)}
    <div
      style={{
        position: "absolute",
        zIndex: 20,
        left: x,
        top: y,
        width: 40,
        height: 48,
        opacity: interpolate(frame, [Math.max(0, first.frame - 12), first.frame, stops[stops.length - 1].frame + 45, stops[stops.length - 1].frame + 62], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        filter: "drop-shadow(0 5px 5px rgba(0,0,0,.25))",
      }}
    >
      <span style={{ position: "absolute", width: 62, height: 62, left: -23, top: -22, border: "4px solid #dafa58", borderRadius: "50%", opacity: clickOpacity, scale: clickScale }} />
      <svg width="38" height="46" viewBox="0 0 38 46" aria-hidden="true" style={{ overflow: "visible" }}><path d="M4 3L31 27H18L11 42L4 3Z" fill="#ffffff" stroke="#10231b" strokeWidth="3.4" strokeLinejoin="round" /></svg>
      {labelVisible ? <span style={{ position: "absolute", left: 24, top: 30, width: "max-content", maxWidth: 230, padding: "8px 12px", border: "1px solid rgba(255,255,255,.14)", borderRadius: 9, backgroundColor: "#10251d", color: "#ffffff", boxShadow: "0 10px 28px rgba(14,39,29,.3)", fontSize: 13, fontWeight: 800 }}>{settledStop.label}</span> : null}
    </div>
    </>
  );
};

export const Pill: React.FC<{ children: ReactNode; color?: "green" | "orange" | "gray" }> = ({ children, color = "green" }) => (
  <span style={{ width: "fit-content", padding: "6px 9px", borderRadius: 999, backgroundColor: color === "green" ? "#e4f4ec" : color === "orange" ? "#fff0e6" : "#edf1ef", color: color === "green" ? "#176d50" : color === "orange" ? "#a95a26" : "#5e6b65", fontSize: 10, fontWeight: 800 }}>{children}</span>
);

export const PhoneFrame: React.FC<{ children: ReactNode; title?: string }> = ({ children, title = "TruckProfit" }) => (
  <div style={{ width: 390, height: 690, padding: 11, border: "8px solid #13211b", borderRadius: 46, backgroundColor: "#dcebc8", color: "#17211d", boxShadow: "0 30px 70px rgba(10,35,25,.28)", display: "grid", gridTemplateRows: "34px 66px 1fr", overflow: "hidden" }}>
    <div style={{ padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 800 }}><span>9:41</span><span>● ◔ ▰</span></div>
    <div style={{ margin: "0 -11px", padding: "8px 22px", borderTop: "1px solid #b9c9ad", borderBottom: "1px solid #b9c9ad", backgroundColor: "rgba(247,251,243,.9)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <CanvasImage src={staticFile("assets/truckprofit-bot-avatar.png")} style={{ width: 38, height: 38, borderRadius: 19 }} />
      <span style={{ display: "grid", fontSize: 15, fontWeight: 800, textAlign: "center" }}>{title}<small style={{ color: "#6f7f77", fontSize: 9, fontWeight: 500 }}>бот</small></span>
    </div>
    <div style={{ minHeight: 0, padding: "18px 10px 12px", backgroundImage: "radial-gradient(rgba(79,122,72,.12) 1px, transparent 1px)", backgroundSize: "16px 16px", display: "flex", flexDirection: "column" }}>{children}</div>
  </div>
);

export const BotBubble: React.FC<{ children: ReactNode; user?: boolean }> = ({ children, user = false }) => (
  <div style={{ maxWidth: "88%", marginBottom: 10, alignSelf: user ? "flex-end" : "flex-start", padding: "11px 13px", borderRadius: user ? "14px 14px 3px 14px" : "14px 14px 14px 3px", backgroundColor: user ? "#c8f0a8" : "#ffffff", boxShadow: "0 3px 9px rgba(39,69,45,.12)", fontSize: 14, lineHeight: 1.4 }}>{children}</div>
);

export const BotButton: React.FC<{ children: ReactNode; active?: boolean }> = ({ children, active = false }) => (
  <div style={{ minHeight: 42, padding: "11px 10px", borderRadius: 9, backgroundColor: active ? "#1a7355" : "#ffffff", color: active ? "#ffffff" : "#1b4b3a", boxShadow: "0 2px 6px rgba(39,69,45,.1)", fontSize: 12, fontWeight: 800, textAlign: "center" }}>{children}</div>
);
