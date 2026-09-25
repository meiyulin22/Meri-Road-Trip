import { ArrowLeft, CalendarDays, CarFront, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { TripState } from "@/domain/trip-state/trip-state";
import { getWorkspaceTitle } from "./workspace-title";
import { journeyDateLabel, journeyFieldLabel, transportLabels } from "./workspace-presentation";
import styles from "./trip-workspace.module.css";

export function WorkspaceHeader({ tripState }: { readonly tripState: TripState }) {
  return (
    <>
      <header className={styles.header} data-region="header">
        <Link className={styles.brandLockup} href="/" aria-label="Meri home">
          <Image src="/brand/meri-home-mountain.png" width={52} height={40} alt="" />
          <span>Meri</span>
        </Link>
        <Link className={styles.homeLink} href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          <span>Back to Home</span>
        </Link>
        <span className={styles.saveState}><i aria-hidden="true" />构思中<span>已保存</span></span>
      </header>
      <section className={styles.journeyHeading} aria-labelledby="journey-title">
        <div className={styles.journeyThumbnail} aria-hidden="true" />
        <div className={styles.journeyHeadingText}>
          <p className={styles.journeyEyebrow}>YOUR NEXT ADVENTURE</p>
          <h1 id="journey-title">{getWorkspaceTitle(tripState)}</h1>
          <p className={styles.journeySubtitle}>一段新的旅程，从这里慢慢展开。</p>
          <div className={styles.journeyMeta}>
            <span><CalendarDays size={15} aria-hidden="true" />{journeyDateLabel(tripState)}</span>
            <span><MapPin size={15} aria-hidden="true" />{journeyFieldLabel(tripState.origin, "出发地待定")}</span>
            <span><CarFront size={15} aria-hidden="true" />{tripState.transportPreference.state === "known" ? transportLabels[tripState.transportPreference.value] : "交通待定"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
