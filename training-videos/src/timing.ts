export const TRANSITION_DURATION = 18;

export const SCENE_DURATIONS = {
  intro: 375,
  fleet: 409,
  trip: 537,
  telegram: 462,
  expense: 370,
  live: 422,
  reports: 455,
  outro: 390,
} as const;

export const TOTAL_DURATION =
  Object.values(SCENE_DURATIONS).reduce((sum, duration) => sum + duration, 0) -
  TRANSITION_DURATION * (Object.keys(SCENE_DURATIONS).length - 1);
