import { Mastra } from "@mastra/core";

import { scoutAgent } from "./scout-agent";

// Mastra reports feature usage to its makers' PostHog unless this is set. Meri sends
// nothing anywhere it was not asked to, so it is off unless someone turns it on.
process.env.MASTRA_TELEMETRY_DISABLED ??= "1";

/** Every agent Meri runs, registered once. */
export const mastra = new Mastra({
  agents: { scout: scoutAgent },
});
