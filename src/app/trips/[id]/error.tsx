"use client";

import Link from "next/link";

export default function TripWorkspaceError({
  reset,
}: {
  readonly reset: () => void;
}) {
  return (
    <main>
      <h1>旅程暂时无法加载</h1>
      <p>Meri 没有修改或替换你的旅程数据。</p>
      <button onClick={reset} type="button">
        重试
      </button>
      <Link href="/">回到首页</Link>
    </main>
  );
}
