import { Easing, interpolate, useCurrentFrame } from "remotion";

import { AppWindow, Pill, SceneBase } from "../components";

export const LiveScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneBase scene="live" audio="voiceover/06-live.wav" number="05" eyebrow="Контроль рейса" title={<>Статус и маршрут<br />обновляются сами.</>}>
      <AppWindow active="Рейсы" title="Караганда → Ушарал" badge="В пути · обновлено сейчас">
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr .65fr", gap: 13 }}>
          <section style={{ padding: 15, border: "1px solid #d6e0db", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><b style={{ display: "block", fontSize: 15 }}>Маршрут и геопозиции водителя</b><small style={{ color: "#75817b", fontSize: 9 }}>Последняя отметка: только что</small></div><span style={{ color: "#6e7a74", fontSize: 9 }}>━ маршрут · ┅ фактические точки</span></div>
            <div style={{ height: 430, marginTop: 12, position: "relative", overflow: "hidden", border: "1px solid #c7d6cf", borderRadius: 10, backgroundColor: "#eaf0e8", backgroundImage: "linear-gradient(27deg, transparent 46%, #d5ded4 47%, #d5ded4 49%, transparent 50%), linear-gradient(119deg, transparent 46%, #d7e1d7 47%, #d7e1d7 49%, transparent 50%)", backgroundSize: "114px 83px, 130px 104px" }}>
              <i style={{ position: "absolute", width: 250, height: 8, left: 60, top: 285, borderRadius: 99, backgroundColor: "#176f53", rotate: "-24deg" }} />
              <i style={{ position: "absolute", width: 285, height: 8, left: 278, top: 190, borderRadius: 99, backgroundColor: "#176f53", rotate: "-13deg" }} />
              <i style={{ position: "absolute", width: 295, height: 8, left: 551, top: 142, borderRadius: 99, backgroundColor: "#176f53", rotate: "8deg" }} />
              <b style={{ position: "absolute", left: 45, top: 282, width: 34, height: 34, border: "4px solid #fff", borderRadius: "50%", backgroundColor: "#176f53", color: "#fff", display: "grid", placeItems: "center", fontSize: 11 }}>A</b>
              <b style={{ position: "absolute", right: 48, top: 168, width: 34, height: 34, border: "4px solid #fff", borderRadius: "50%", backgroundColor: "#dd7f3b", color: "#fff", display: "grid", placeItems: "center", fontSize: 11 }}>B</b>
              {[{ left: 185, top: 220, n: "1" }, { left: 390, top: 160, n: "2" }].map((pin) => <b key={pin.n} style={{ position: "absolute", left: pin.left, top: pin.top, width: 31, height: 31, border: "4px solid #fff", borderRadius: "50%", backgroundColor: "#dafa58", color: "#173024", display: "grid", placeItems: "center", fontSize: 10, boxShadow: "0 0 0 5px rgba(218,250,88,.28)" }}>{pin.n}</b>)}
              <b style={{ position: "absolute", zIndex: 4, left: interpolate(frame, [15, 360], [205, 688], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.42, 0, 0.58, 1) }), top: interpolate(frame, [15, 360], [218, 136], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.42, 0, 0.58, 1) }), width: 40, height: 40, border: "4px solid #fff", borderRadius: "50% 50% 50% 8px", backgroundColor: "#0e4f3b", color: "#dafa58", display: "grid", placeItems: "center", rotate: "-45deg", boxShadow: "0 8px 22px rgba(15,53,39,.38)", fontSize: 18 }}><span style={{ rotate: "45deg" }}>▣</span></b>
              <span style={{ position: "absolute", left: 35, bottom: 70, padding: "8px 10px", borderRadius: 8, backgroundColor: "#fff", fontSize: 10, fontWeight: 800 }}>Караганда · погрузка</span>
              <span style={{ position: "absolute", right: 30, top: 115, padding: "8px 10px", borderRadius: 8, backgroundColor: "#fff", fontSize: 10, fontWeight: 800 }}>Ушарал · выгрузка</span>
            </div>
          </section>
          <section style={{ padding: 17, border: "1px solid #d6e0db", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}><div><small style={{ color: "#718079", fontSize: 9, fontWeight: 850 }}>ВОДИТЕЛЬ</small><h3 style={{ margin: "4px 0", fontSize: 17 }}>Иван Петров</h3></div><Pill>В пути</Pill></div>
            <div style={{ marginTop: 16, padding: "13px 14px", borderRadius: 10, backgroundColor: "#eef5f1" }}><small style={{ color: "#6d7a73", fontSize: 9 }}>ПОСЛЕДНЯЯ ОТМЕТКА</small><b style={{ marginTop: 6, display: "block", fontSize: 14 }}>Остановка на отдых</b><p style={{ margin: "5px 0 0", color: "#68756f", fontSize: 10 }}>Сегодня, 14:25</p></div>
            <h4 style={{ margin: "22px 0 8px", fontSize: 12 }}>История статусов</h4>
            {[{ status: "В пути", time: "14:24" }, { status: "На погрузке", time: "09:15" }, { status: "Ожидаю погрузку", time: "08:40" }].map((item, index) => <div key={item.status} style={{ position: "relative", padding: "12px 0 12px 22px", borderTop: "1px solid #e2e8e5", opacity: interpolate(frame, [70 + index * 40, 95 + index * 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><i style={{ position: "absolute", left: 2, top: 17, width: 8, height: 8, border: "2px solid #1d7658", borderRadius: "50%", backgroundColor: "#fff" }} /><b style={{ display: "block", fontSize: 12 }}>{item.status}</b><small style={{ color: "#76827c", fontSize: 9 }}>{item.time} · Telegram</small></div>)}
          </section>
        </div>
      </AppWindow>
    </SceneBase>
  );
};
