import { Easing, interpolate, useCurrentFrame } from "remotion";

import { BotBubble, BotButton, GuidedCursor, PhoneFrame, SceneBase } from "../components";

const statuses = ["Ожидаю погрузку", "На погрузке", "В пути", "Ожидаю выгрузку", "Выгружен", "Прочее"];

export const TelegramScene: React.FC = () => {
  const frame = useCurrentFrame();
  const selected = frame < 350 ? "Ожидаю погрузку" : frame < 570 ? "В пути" : "Прочее";

  return (
    <SceneBase scene="telegram" audio="voiceover/04-telegram.wav" number="03" eyebrow="Telegram водителя" title={<>Водитель работает<br /><span style={{ color: "#dafa58" }}>без новой CRM.</span></>} dark>
      <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "430px 1fr", alignItems: "center", gap: 48 }}>
        <div style={{ justifySelf: "center", opacity: interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [0, 24], ["0px 28px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}>
          <PhoneFrame>
            <BotBubble><b>Вам назначен новый рейс</b><br />Караганда → Ушарал<br /><small style={{ color: "#68776f" }}>Volvo FH · 1 317 км</small></BotBubble>
            <BotBubble user>🚛 Мой рейс</BotBubble>
            <BotBubble><b>Текущий статус</b><br /><span style={{ color: "#1c7657" }}>{selected}</span></BotBubble>
            <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {statuses.map((status) => <BotButton key={status} active={status === selected}>{status}</BotButton>)}
            </div>
          </PhoneFrame>
        </div>

        <div style={{ alignSelf: "center", paddingRight: 32 }}>
          <div style={{ marginBottom: 28, padding: "20px 22px", border: "1px solid rgba(218,250,88,.35)", borderRadius: 16, backgroundColor: "rgba(218,250,88,.08)", display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ width: 52, height: 52, flex: "0 0 auto", borderRadius: 15, backgroundColor: "#dafa58", color: "#173024", display: "grid", placeItems: "center", fontSize: 24 }}>↗</span>
            <div><small style={{ color: "#8fa89d", fontSize: 11, fontWeight: 850, letterSpacing: 1.5 }}>УВЕДОМЛЕНИЕ</small><h3 style={{ margin: "5px 0 0", fontSize: 25 }}>Новый рейс приходит сам</h3></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {["Маршрут и машина", "Текущий статус", "Геопозиция", "Свободный комментарий"].map((item, index) => <div key={item} style={{ minHeight: 120, padding: 20, border: "1px solid rgba(255,255,255,.13)", borderRadius: 16, backgroundColor: "rgba(255,255,255,.055)", display: "grid", alignContent: "space-between", opacity: interpolate(frame, [50 + index * 28, 75 + index * 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [50 + index * 28, 75 + index * 28], ["0px 16px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}><span style={{ color: "#dafa58", fontSize: 12, fontWeight: 900 }}>0{index + 1}</span><b style={{ fontSize: 18 }}>{item}</b></div>)}
          </div>
          {selected === "Прочее" ? <div style={{ marginTop: 12, padding: "17px 20px", borderRadius: 14, backgroundColor: "#ffffff", color: "#183128", fontSize: 16 }}><b>Комментарий водителя:</b> задержка на погранпереходе</div> : null}
        </div>
        <GuidedCursor stops={[
          { frame: 118, x: 305, y: 222, click: true, label: "Открыть мой рейс" },
          { frame: 245, x: 118, y: 565, click: true, label: "Ожидаю погрузку" },
          { frame: 350, x: 118, y: 616, click: true, label: "В пути" },
          { frame: 570, x: 300, y: 666, click: true, label: "Прочее + комментарий" },
        ]} />
      </div>
    </SceneBase>
  );
};
