import { useCurrentFrame } from "remotion";

import { AppWindow, Field, GuidedCursor, Pill, SceneBase } from "../components";

export const FleetScene: React.FC = () => {
  const frame = useCurrentFrame();
  const showDriver = frame >= 186;

  return (
    <SceneBase scene="fleet" audio="voiceover/02-fleet.wav" number="01" eyebrow="Подготовка" title={<>Добавьте машину<br />и водителя.</>}>
      <AppWindow active={showDriver ? "Водители" : "Автомобили"} title={showDriver ? "Водители" : "Автомобили"} badge={showDriver ? "3 водителя" : "3 автомобиля"}>
        {!showDriver ? <>
          <section style={{ padding: 20, border: "1px solid #d9e2dd", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small style={{ color: "#1b7556", fontSize: 10, fontWeight: 850 }}>НОВЫЙ АВТОМОБИЛЬ</small><h3 style={{ margin: "5px 0 0", fontSize: 20 }}>Добавить транспорт</h3></div><span style={{ color: "#7c8983", fontSize: 11 }}>Основные данные</span></div>
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="МАРКА И МОДЕЛЬ" value="Volvo FH" active={frame >= 58 && frame < 100} />
              <Field label="ГОС. НОМЕР" value="123 ABC 10" active={frame >= 100 && frame < 145} />
              <Field label="ТИП" value="Тягач" />
            </div>
            <button style={{ width: 210, height: 48, marginTop: 18, border: 0, borderRadius: 10, backgroundColor: "#176e52", color: "#ffffff", fontSize: 13, fontWeight: 850 }}>Добавить автомобиль</button>
          </section>
          <section style={{ marginTop: 13, padding: "17px 20px", border: "1px solid #d9e2dd", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ color: "#738079", display: "grid", gridTemplateColumns: "1.2fr .8fr .7fr", fontSize: 9, fontWeight: 850 }}><span>АВТОМОБИЛЬ</span><span>ГОС. НОМЕР</span><span>СТАТУС</span></div>
            {["Scania R450", "MAN TGX"].map((name, index) => <div key={name} style={{ padding: "15px 0", borderTop: "1px solid #e4e9e6", display: "grid", gridTemplateColumns: "1.2fr .8fr .7fr", alignItems: "center", fontSize: 12 }}><b>{name}</b><span>{index ? "907 BCA 01" : "821 KZA 10"}</span><Pill>Свободен</Pill></div>)}
          </section>
          <GuidedCursor stops={[
            { frame: 58, x: 470, y: 190, click: true, label: "Марка и модель" },
            { frame: 102, x: 920, y: 190, click: true, label: "Гос. номер" },
            { frame: 145, x: 360, y: 319, click: true, label: "Добавить автомобиль" },
            { frame: 175, x: 105, y: 245, click: true, label: "Открыть водителей" },
          ]} />
        </> : <>
          <section style={{ padding: 20, border: "1px solid #d9e2dd", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small style={{ color: "#1b7556", fontSize: 10, fontWeight: 850 }}>НОВЫЙ ВОДИТЕЛЬ</small><h3 style={{ margin: "5px 0 0", fontSize: 20 }}>Добавить в команду</h3></div><Pill>Telegram подключается позже</Pill></div>
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="ИМЯ ВОДИТЕЛЯ" value="Иван Петров" active={frame >= 210 && frame < 270} />
              <Field label="ЗАКРЕПЛЁННЫЙ АВТОМОБИЛЬ" value="Volvo FH · 123 ABC 10" active={frame >= 270 && frame < 325} />
            </div>
            <button style={{ width: 210, height: 48, marginTop: 18, border: 0, borderRadius: 10, backgroundColor: "#176e52", color: "#ffffff", fontSize: 13, fontWeight: 850 }}>Добавить водителя</button>
          </section>
          <section style={{ marginTop: 13, padding: "16px 20px", border: "1px solid #d9e2dd", borderRadius: 14, backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><b style={{ display: "block", fontSize: 15 }}>Алексей Орлов</b><small style={{ color: "#75817b", fontSize: 10 }}>Scania R450 · Telegram подключён</small></div><Pill>Свободен</Pill></div>
          </section>
          <GuidedCursor stops={[
            { frame: 212, x: 585, y: 190, click: true, label: "Имя водителя" },
            { frame: 272, x: 1255, y: 190, click: true, label: "Закрепить автомобиль" },
            { frame: 330, x: 360, y: 319, click: true, label: "Добавить водителя" },
          ]} />
        </>}
      </AppWindow>
    </SceneBase>
  );
};
