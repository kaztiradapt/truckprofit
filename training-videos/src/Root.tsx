import { Composition, Folder } from "remotion";

import { TruckProfitTrainingVideo } from "./Composition";
import { ExpenseScene } from "./scenes/ExpenseScene";
import { FleetScene } from "./scenes/FleetScene";
import { IntroScene } from "./scenes/IntroScene";
import { LiveScene } from "./scenes/LiveScene";
import { OutroScene } from "./scenes/OutroScene";
import { ReportsScene } from "./scenes/ReportsScene";
import { TelegramScene } from "./scenes/TelegramScene";
import { TripScene } from "./scenes/TripScene";
import { SCENE_DURATIONS, TOTAL_DURATION } from "./timing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TruckProfit-FirstTrip" component={TruckProfitTrainingVideo} durationInFrames={TOTAL_DURATION} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="Scene-01-Intro" component={IntroScene} durationInFrames={SCENE_DURATIONS.intro} fps={30} width={1920} height={1080} />
        <Composition id="Scene-02-Fleet" component={FleetScene} durationInFrames={SCENE_DURATIONS.fleet} fps={30} width={1920} height={1080} />
        <Composition id="Scene-03-Trip" component={TripScene} durationInFrames={SCENE_DURATIONS.trip} fps={30} width={1920} height={1080} />
        <Composition id="Scene-04-Telegram" component={TelegramScene} durationInFrames={SCENE_DURATIONS.telegram} fps={30} width={1920} height={1080} />
        <Composition id="Scene-05-Expense" component={ExpenseScene} durationInFrames={SCENE_DURATIONS.expense} fps={30} width={1920} height={1080} />
        <Composition id="Scene-06-Live" component={LiveScene} durationInFrames={SCENE_DURATIONS.live} fps={30} width={1920} height={1080} />
        <Composition id="Scene-07-Reports" component={ReportsScene} durationInFrames={SCENE_DURATIONS.reports} fps={30} width={1920} height={1080} />
        <Composition id="Scene-08-Outro" component={OutroScene} durationInFrames={SCENE_DURATIONS.outro} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
