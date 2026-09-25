import { ArrowLeft, MoreHorizontal, Save } from "lucide-react";
import Link from "next/link";

import type { TripState } from "@/domain/trip-state/trip-state";

import { getWorkspaceTitle } from "./workspace-title";
import styles from "./trip-workspace.module.css";

export function WorkspaceHeader({ tripState }: { readonly tripState: TripState }) {
  return (
        <header className={styles.header} data-region="header">
          <Link
            className={styles.homeLink}
            href="/"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            <span>回到首页</span>
          </Link>

          <div className={styles.headerTitle}>
            <span>TRIP WORKSPACE</span>
            <h1>{getWorkspaceTitle(tripState)}</h1>
          </div>

          <div className={styles.journeyControl} aria-label="Journey control">
            <div className={styles.saveState}>
              <span>IDEA</span>
              <span>已保存</span>
            </div>
            <button disabled type="button">
              <Save aria-hidden="true" size={16} />
              已保存
            </button>
            <button aria-label="更多旅程操作（暂不可用）" disabled type="button">
              <MoreHorizontal aria-hidden="true" size={17} />
            </button>
          </div>
        </header>
  );
}
