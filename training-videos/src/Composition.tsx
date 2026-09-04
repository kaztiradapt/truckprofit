import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";

import { ExpenseScene } from "./scenes/ExpenseScene";
import { FleetScene } from "./scenes/FleetScene";
import { IntroScene } from "./scenes/IntroScene";
import { LiveScene } from "./scenes/LiveScene";
import { OutroScene } from "./scenes/OutroScene";
import { ReportsScene } from "./scenes/ReportsScene";
import { TelegramScene } from "./scenes/TelegramScene";
import { TripScene } from "./scenes/TripScene";
import { SCENE_DURATIONS, TRANSITION_DURATION } from "./timing";

export const TruckProfitTrainingVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.intro} name="01 · Вступление"><IntroScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.fleet} name="02 · Машина и водитель"><FleetScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.trip} name="03 · Создание рейса"><TripScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.telegram} name="04 · Telegram водителя"><TelegramScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.expense} name="05 · Расход и чек"><ExpenseScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.live} name="06 · Контроль рейса"><LiveScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.reports} name="07 · Отчёты"><ReportsScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATION })} />
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.outro} name="08 · Финал"><OutroScene /></TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
