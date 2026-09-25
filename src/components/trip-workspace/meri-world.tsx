import { Binoculars, CircleDollarSign, Route } from "lucide-react";
import Image from "next/image";

import styles from "./trip-workspace.module.css";

const contextualActions = [
  { icon: Binoculars, label: "比较雪况" },
  { icon: Route, label: "交通方案" },
  { icon: CircleDollarSign, label: "看看预算" },
];

export function MeriWorld() {
  return (
    <section
      aria-labelledby="meri-world-title"
      className={styles.meriWorld}
      data-region="meri-world"
    >
      <div className={styles.worldHeading}>
        <p>MERI BASE CAMP</p>
        <h2 className={styles.srOnly} id="meri-world-title">旅程正在展开</h2>
      </div>

      <div
        aria-label="Meri companion and conversation shortcuts"
        className={styles.companionScene}
        data-region="companion-scene"
      >
        <Image
          alt="Meri companion"
          className={styles.companion}
          height={84}
          priority
          src="/companion/idle/south.png"
          width={84}
        />
        <div className={styles.companionPrompt}>
          <p>我把目前理解的旅程整理在旅程信息里了，哪里不对，直接点一下就能改。</p>
          <div aria-label="Conversation shortcuts" className={styles.contextualActions}>
            {contextualActions.map(({ icon: Icon, label }) => (
              <button disabled key={label} type="button">
                <Icon aria-hidden="true" size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
