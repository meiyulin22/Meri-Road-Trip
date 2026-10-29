"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { shouldVisitIntro } from "./intro-visit";

/** Handles soft navigation to Home; the head script handles direct visits. */
export function IntroEntryGate() {
  const router = useRouter();
  useEffect(() => {
    if (shouldVisitIntro()) router.replace("/intro");
  }, [router]);
  return null;
}
