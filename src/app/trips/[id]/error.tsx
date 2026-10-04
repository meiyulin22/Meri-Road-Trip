"use client";

import Link from "next/link";

import { useMessages } from "@/components/i18n/locale-context";

export default function TripWorkspaceError({
  reset,
}: {
  readonly reset: () => void;
}) {
  const text = useMessages().workspace;
  return (
    <main>
      <h1>{text.loadFailed}</h1>
      <p>{text.loadFailedDetail}</p>
      <button onClick={reset} type="button">
        {text.retry}
      </button>
      <Link href="/">{text.toHome}</Link>
    </main>
  );
}
