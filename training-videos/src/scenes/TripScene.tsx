import { useCurrentFrame } from "remotion";

import { AppWindow, Field, GuidedCursor, Pill, SceneBase } from "../components";

export const TripScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneBase scene="trip" audio="voiceover/03-trip.wav" number="02" eyebrow="Создание рейса" title={<>Соберите рейс<br />в одной форме.</>}>
      <AppWindow active="Создание рейса" title="Новый рейс" badge="Черновик">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 11 }}>
          <Field label="ВОДИТЕЛЬ" value="Иван Петров" active={frame >= 335 && frame < 385} />
          <Field label="АВТОМОБИЛЬ" value="Volvo FH · 123 ABC 10" active={frame >= 385 && frame < 430} />
          <Field label="ДАТА СТАРТА" value="03.09.2026" />
        </div>
        <div style={{ marginTop: 15, display: "grid", gridTemplateColumns: ".92fr 1.08fr", gap: 14 }}>
          <section style={{ padding: 17, border: "1px solid #d6e0db", borderRadius: 13, backgroundColor: "#ffffff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="ПОГРУЗКА" value="Караганда, ул. Складская, 18" active={frame >= 75 && frame < 135} />
              <Field label="ВЫГРУЗКА" value="Ушарал, Промышленная зона" active={frame >= 135 && frame < 205} />
            </div>
            <div style={{ marginTop: 13, height: 220, position: "relative", overflow: "hidden", border: "1px solid #cbd9d2", borderRadius: 11, backgroundColor: "#e9efe8", backgroundImage: "linear-gradient(27deg, transparent 46%, #d4ddd3 47%, #d4ddd3 49%, transparent 50%), linear-gradient(119deg, transparent 46%, #d5dfd5 47%, #d5dfd5 49%, transparent 50%)", backgroundSize: "90px 70px, 100px 84px" }}>
              <i style={{ position: "absolute", width: 220, height: 7, left: 70, top: 78, borderRadius: 99, backgroundColor: "#176f53", rotate: "10deg" }} />
              <i style={{ position: "absolute", width: 250, height: 7, left: 276, top: 119, borderRadius: 99, backgroundColor: "#176f53", rotate: "18deg" }} />
              <i style={{ position: "absolute", width: 190, height: 7, left: 511, top: 177, borderRadius: 99, backgroundColor: "#176f53", rotate: "-9deg" }} />
              <b style={{ position: "absolute", left: 56, top: 65, width: 28, height: 28, border: "3px solid #fff", borderRadius: "50%", backgroundColor: "#176f53", color: "#fff", display: "grid", placeItems: "center", fontSize: 10 }}>A</b>
              <b style={{ position: "absolute", right: 46, bottom: 22, width: 28, height: 28, border: "3px solid #fff", borderRadius: "50%", backgroundColor: "#dd7f3b", color: "#fff", display: "grid", placeItems: "center", fontSize: 10 }}>B</b>
              <span style={{ position: "absolute", left: 45, top: 40, fontSize: 10, fontWeight: 800 }}>Караганда</span>
              <span style={{ position: "absolute", right: 28, bottom: 4, fontSize: 10, fontWeight: 800 }}>Ушарал</span>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}><Pill>Вариант 1 · 1 317 км</Pill><Pill color="gray">Вариант 2 · 1 402 км</Pill></div>
          </section>

          <section style={{ padding: 17, border: "1px solid #d6e0db", borderRadius: 13, backgroundColor: "#ffffff", display: "grid", alignContent: "start", gap: 11 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="ЗАКАЗЧИК" value="ТОО Север Логистик" />
              <Field label="ДОХОД" value="850 000" active={frame >= 465 && frame < 535} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="ВАЛЮТА" value="KZT — тенге" />
              <Field label="ПРОБЕГ" value="1 317 км" active={frame >= 270 && frame < 335} />
            </div>
            <div style={{ padding: 15, borderRadius: 11, backgroundColor: "#eff4f1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <span style={{ color: "#69776f", display: "grid", gap: 5, fontSize: 10 }}>Водитель<b style={{ color: "#18221e", fontSize: 13 }}>Иван Петров</b></span>
              <span style={{ color: "#69776f", display: "grid", gap: 5, fontSize: 10 }}>Автомобиль<b style={{ color: "#18221e", fontSize: 13 }}>Volvo FH</b></span>
            </div>
            <button style={{ height: 52, marginTop: 3, border: 0, borderRadius: 10, backgroundColor: "#176e52", color: "#ffffff", fontSize: 14, fontWeight: 850 }}>Создать рейс</button>
          </section>
        </div>
        <GuidedCursor stops={[
          { frame: 78, x: 355, y: 305, click: true, label: "Адрес погрузки" },
          { frame: 142, x: 555, y: 305, click: true, label: "Адрес выгрузки" },
          { frame: 220, x: 335, y: 590, click: true, label: "Выбрать маршрут" },
          { frame: 282, x: 1015, y: 380, click: true, label: "Проверить пробег" },
          { frame: 342, x: 385, y: 205, click: true, label: "Выбрать водителя" },
          { frame: 395, x: 690, y: 205, click: true, label: "Машина подставится" },
          { frame: 478, x: 1015, y: 305, click: true, label: "Указать доход" },
          { frame: 580, x: 900, y: 520, click: true, label: "Создать рейс" },
        ]} />
      </AppWindow>
    </SceneBase>
  );
};
