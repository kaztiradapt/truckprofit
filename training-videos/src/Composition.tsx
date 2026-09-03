import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { ExpenseScene } from "./scenes/ExpenseScene";
import { FleetScene } from "./scenes/FleetScene";
import { IntroScene } from "./scenes/IntroScene";
import { LiveScene } from "./scenes/LiveScene";
import { OutroScene } from "./scenes/OutroScene";
import { ReportsScene } from "./scenes/ReportsScene";
import { TelegramScene } from "./scenes/TelegramScene";
import { TripScene } from "./scenes/TripScene";

export const TruckProfitTrainingVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={315} name="01 · Вступление"><IntroScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={516} name="02 · Машина и водитель"><FleetScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={489} name="03 · Создание рейса"><TripScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={597} name="04 · Telegram водителя"><TelegramScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={444} name="05 · Расход и чек"><ExpenseScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={402} name="06 · Контроль рейса"><LiveScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={555} name="07 · Отчёты"><ReportsScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence durationInFrames={285} name="08 · Финал"><OutroScene /></TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
