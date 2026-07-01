// @tempo-home — Tempo home canvas (the workspace Run button opens this). Managed marker; do not remove.
import type { TempoCanvasConfig, TempoStoryboard, TempoRouteStoryboard } from 'tempo-sdk';

const config: TempoCanvasConfig = {
  name: "Home",
};

export default config;

export const Home: TempoRouteStoryboard = {
  route: "/",
  layout: { x: 0, y: 0, width: 600, height: 400 },
};
