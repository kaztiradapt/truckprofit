import { Easing, interpolate, useCurrentFrame } from "remotion";

import { AppWindow, Field, GuidedCursor, SceneBase } from "../components";

const bars = [38, 52, 47, 66, 59, 83];

export const ReportsScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneBase scene="reports" audio="voiceover/07-reports.wav" number="06" eyebrow="Управленческие отчёты" title={<>Сравнивайте<br />и находите потери.</>}>
      <AppWindow active="Отчёты" title="Управленческие отчёты" badge="Данные обновлены">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}><Field label="ПЕРИОД" value="Последние 30 дней" active={frame >= 82 && frame < 142} /><Field label="АВТОМОБИЛЬ" value="Все автомобили" active={frame >= 142 && frame < 202} /><Field label="ВОДИТЕЛЬ" value="Все водители" active={frame >= 202 && frame < 262} /></div>
        <div style={{ marginTop: 13, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
          {[{ l: "Выручка", v: "18,4 млн ₸" }, { l: "Расходы", v: "12,1 млн ₸" }, { l: "Прибыль", v: "6,3 млн ₸", dark: true }, { l: "Маржа", v: "34,2%" }].map((item) => <div key={item.l} style={{ minHeight: 80, padding: 13, border: `1px solid ${item.dark ? "#174f3d" : "#dbe3df"}`, borderRadius: 11, backgroundColor: item.dark ? "#174f3d" : "#fff", color: item.dark ? "#fff" : "#17211d", display: "grid", alignContent: "space-between" }}><small style={{ color: item.dark ? "#aac8bc" : "#74817b", fontSize: 9 }}>{item.l}</small><b style={{ fontSize: 17 }}>{item.v}</b></div>)}
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.08fr .92fr", gap: 12 }}>
          <section style={{ height: 330, padding: "17px 18px", border: "1px solid #dbe3df", borderRadius: 13, backgroundColor: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 14 }}>Прибыль по месяцам</b><small style={{ color: "#77847d", fontSize: 9 }}>KZT</small></div>
            <div style={{ height: 250, marginTop: 18, padding: "0 15px", borderLeft: "1px solid #e2e8e5", borderBottom: "1px solid #e2e8e5", backgroundImage: "linear-gradient(#ebefed 1px, transparent 1px)", backgroundSize: "100% 25%", display: "flex", alignItems: "flex-end", justifyContent: "space-around", gap: 16 }}>
              {bars.map((height, index) => <span key={height} style={{ height: "100%", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 7 }}><i style={{ width: "65%", height: `${interpolate(frame, [70 + index * 9, 120 + index * 9], [0, height], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })}%`, borderRadius: "7px 7px 2px 2px", backgroundColor: index === bars.length - 1 ? "#dafa58" : "#176e52", boxShadow: "0 5px 15px rgba(23,110,82,.18)" }} /><b style={{ color: "#78857e", fontSize: 9 }}>{["Апр", "Май", "Июн", "Июл", "Авг", "Сен"][index]}</b></span>)}
            </div>
          </section>
          <section style={{ height: 330, display: "grid", gridTemplateRows: "1fr auto", gap: 10 }}>
            <div style={{ padding: 17, border: "1px solid #dbe3df", borderRadius: 13, backgroundColor: "#fff" }}><b style={{ fontSize: 14 }}>Лидеры по прибыли</b>{[{ n: "Volvo FH", v: "2,4 млн ₸" }, { n: "Scania R450", v: "1,9 млн ₸" }, { n: "MAN TGX", v: "1,3 млн ₸" }].map((item, index) => <div key={item.n} style={{ padding: "14px 0", borderTop: "1px solid #e4e9e6", display: "grid", gridTemplateColumns: "25px 1fr auto", alignItems: "center", gap: 9 }}><span style={{ color: "#73817a", fontSize: 9 }}>0{index + 1}</span><b style={{ fontSize: 11 }}>{item.n}</b><strong style={{ color: "#176e52", fontSize: 12 }}>{item.v}</strong></div>)}</div>
            <div style={{ padding: 15, borderRadius: 13, backgroundColor: "#102a21", color: "#fff", opacity: interpolate(frame, [270, 305], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [270, 305], ["0px 14px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 33, height: 33, borderRadius: 9, backgroundColor: "#dafa58", color: "#173024", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 900 }}>AI</span><div><small style={{ color: "#8ea79c", fontSize: 8 }}>ИИ-АНАЛИТИК</small><b style={{ display: "block", fontSize: 12 }}>Что изменилось в расходах?</b></div></div><p style={{ margin: "10px 0 0", color: "#b9cac2", fontSize: 10, lineHeight: 1.5 }}>Расход топлива на километр вырос у двух автомобилей. Проверьте Volvo FH.</p></div>
          </section>
        </div>
        <GuidedCursor stops={[
          { frame: 88, x: 385, y: 205, click: true, label: "Выбрать период" },
          { frame: 148, x: 695, y: 205, click: true, label: "Фильтр по машине" },
          { frame: 208, x: 1000, y: 205, click: true, label: "Фильтр по водителю" },
          { frame: 510, x: 1010, y: 618, click: true, label: "Открыть вывод ИИ" },
        ]} />
      </AppWindow>
    </SceneBase>
  );
};
