import type { Metadata } from "next";

import { TripWorkspace } from "@/components/trip-workspace/trip-workspace";

export const metadata: Metadata = {
  title: "New Journey | Meri",
};

export default function NewTripWorkspacePage() {
  return <TripWorkspace />;
}
