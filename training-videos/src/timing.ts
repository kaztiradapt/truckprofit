export const TRANSITION_DURATION = 15;

export const SCENE_DURATIONS = {
  intro: 444,
  fleet: 654,
  trip: 675,
  telegram: 736,
  expense: 528,
  live: 529,
  reports: 686,
  outro: 396,
} as const;

export const TOTAL_DURATION = Object.values(SCENE_DURATIONS).reduce((sum, duration) => sum + duration, 0)
  - TRANSITION_DURATION * (Object.keys(SCENE_DURATIONS).length - 1);
