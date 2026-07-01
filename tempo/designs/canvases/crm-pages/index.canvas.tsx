import type { TempoCanvasConfig, TempoStoryboard, TempoRouteStoryboard } from 'tempo-sdk';

const config: TempoCanvasConfig = {
  name: "CRM Pages",
};

export default config;

export const Dashboard: TempoRouteStoryboard = {
  route: "/",
  name: "Dashboard",
  layout: { x: 0, y: 0, width: 1280, height: 800 },
};

export const Customers: TempoRouteStoryboard = {
  route: "/customers",
  name: "Customers",
  layout: { x: 1330, y: 0, width: 1280, height: 800 },
};

export const Jobs: TempoRouteStoryboard = {
  route: "/jobs",
  name: "Jobs",
  layout: { x: 0, y: 850, width: 1280, height: 800 },
};

export const Schedule: TempoRouteStoryboard = {
  route: "/schedule",
  name: "Schedule",
  layout: { x: 0, y: 1700, width: 1280, height: 800 },
};

export const Estimates: TempoRouteStoryboard = {
  route: "/estimates",
  name: "Estimates",
  layout: { x: 0, y: 2550, width: 1280, height: 800 },
};

export const Invoices: TempoRouteStoryboard = {
  route: "/invoices",
  name: "Invoices",
  layout: { x: 0, y: 3400, width: 1280, height: 800 },
};

export const Settings: TempoRouteStoryboard = {
  route: "/settings",
  name: "Settings",
  layout: { x: 0, y: 4250, width: 1280, height: 800 },
};
