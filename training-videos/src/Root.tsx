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

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TruckProfit-FirstTrip" component={TruckProfitTrainingVideo} durationInFrames={3498} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="Scene-01-Intro" component={IntroScene} durationInFrames={315} fps={30} width={1920} height={1080} />
        <Composition id="Scene-02-Fleet" component={FleetScene} durationInFrames={516} fps={30} width={1920} height={1080} />
        <Composition id="Scene-03-Trip" component={TripScene} durationInFrames={489} fps={30} width={1920} height={1080} />
        <Composition id="Scene-04-Telegram" component={TelegramScene} durationInFrames={597} fps={30} width={1920} height={1080} />
        <Composition id="Scene-05-Expense" component={ExpenseScene} durationInFrames={444} fps={30} width={1920} height={1080} />
        <Composition id="Scene-06-Live" component={LiveScene} durationInFrames={402} fps={30} width={1920} height={1080} />
        <Composition id="Scene-07-Reports" component={ReportsScene} durationInFrames={555} fps={30} width={1920} height={1080} />
        <Composition id="Scene-08-Outro" component={OutroScene} durationInFrames={285} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
