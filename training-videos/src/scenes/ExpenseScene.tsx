import { Easing, interpolate, useCurrentFrame } from "remotion";

import { AppWindow, BotBubble, BotButton, GuidedCursor, PhoneFrame, Pill, SceneBase } from "../components";

export const ExpenseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const saved = frame > 230;

  return (
    <SceneBase scene="expense" audio="voiceover/05-expense.wav" number="04" eyebrow="Расходы" title={<>Расход и чек<br />сразу в рейсе.</>}>
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <AppWindow active="Расходы" title="Расходы" badge={saved ? "Обновлено сейчас" : "В реальном времени"}>
          <div style={{ marginLeft: 210, padding: 19, border: "1px solid #d8e1dc", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small style={{ color: "#6f7d76", fontSize: 9, fontWeight: 850 }}>АКТИВНЫЙ РЕЙС</small><h3 style={{ margin: "4px 0 0", fontSize: 19 }}>Караганда → Ушарал</h3></div><Pill>В пути</Pill></div>
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: ".9fr .7fr .55fr .6fr", color: "#74817b", fontSize: 9, fontWeight: 850 }}><span>КАТЕГОРИЯ</span><span>ВОДИТЕЛЬ</span><span>СУММА</span><span>ДОКУМЕНТ</span></div>
            {[{ category: "Топливо", amount: "38 400 ₸", receipt: "Открыть чек" }, { category: "Платная дорога", amount: "2 100 ₸", receipt: "Без чека" }, ...(saved ? [{ category: "Стоянка", amount: "3 500 ₸", receipt: "Открыть чек" }] : [])].map((item, index) => <div key={item.category} style={{ padding: "15px 0", borderTop: "1px solid #e3e9e6", display: "grid", gridTemplateColumns: ".9fr .7fr .55fr .6fr", alignItems: "center", opacity: index === 2 ? interpolate(frame, [230, 254], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1, translate: index === 2 ? interpolate(frame, [230, 254], ["0px -10px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }) : "0px 0px" }}><b style={{ fontSize: 13 }}>{item.category}</b><span style={{ color: "#6d7973", fontSize: 11 }}>Иван Петров</span><b style={{ color: "#176e51", fontSize: 13 }}>{item.amount}</b><span style={{ width: "fit-content", padding: "7px 9px", border: "1px solid #b9cec4", borderRadius: 7, color: item.receipt === "Без чека" ? "#87928d" : "#176e51", fontSize: 9, fontWeight: 800 }}>{item.receipt}</span></div>)}
          </div>
          <div style={{ margin: "13px 0 0 210px", padding: "16px 18px", border: "1px solid #d8e1dc", borderRadius: 14, backgroundColor: "#f0f5f2", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: "#66736d", display: "grid", gap: 4, fontSize: 10 }}>Расходы рейса<b style={{ color: "#17221d", fontSize: 18 }}>44 000 ₸</b></span><span style={{ color: "#66736d", display: "grid", gap: 4, fontSize: 10 }}>Последнее обновление<b style={{ color: "#176e51", fontSize: 13 }}>{saved ? "только что" : "2 минуты назад"}</b></span></div>
        </AppWindow>

        <div style={{ position: "absolute", zIndex: 8, left: -85, bottom: -65, scale: 0.73, transformOrigin: "left bottom", opacity: interpolate(frame, [12, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <PhoneFrame>
            <BotBubble><b>Добавить расход</b><br />Караганда → Ушарал</BotBubble>
            <BotBubble user>{saved ? "Стоянка · 3 500 KZT" : "Категория: Стоянка"}</BotBubble>
            <BotBubble>{saved ? "✅ Расход и чек сохранены" : "Прикрепите фотографию чека"}</BotBubble>
            <div style={{ marginTop: 18, padding: 18, border: "1px dashed #7e988a", borderRadius: 14, backgroundColor: "rgba(255,255,255,.58)", textAlign: "center", fontSize: 13 }}>{saved ? "🧾 receipt.jpg" : "📎 Добавить фотографию"}</div>
            <div style={{ marginTop: "auto" }}><BotButton active>{saved ? "Готово" : "Сохранить расход"}</BotButton></div>
          </PhoneFrame>
        </div>
        <GuidedCursor stops={[
          { frame: 145, x: 72, y: 397, click: true, label: "Прикрепить чек" },
          { frame: 220, x: 78, y: 587, click: true, label: "Сохранить расход" },
          { frame: 300, x: 1470, y: 331, click: true, label: "Открыть чек" },
        ]} />
      </div>
    </SceneBase>
  );
};
