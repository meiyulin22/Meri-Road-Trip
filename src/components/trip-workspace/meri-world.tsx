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
    <section className={styles.meriWorld} aria-label="Meri companion" data-region="meri-world">
      <div className={styles.contextualActions} aria-label="Conversation shortcuts">
        {contextualActions.map(({ icon: Icon, label }) => (
          <button disabled key={label} type="button" title="即将开放">
            <Icon aria-hidden="true" size={22} />
            <span>{label}</span>
            <small>即将开放</small>
          </button>
        ))}
      </div>
      <p className={styles.companionNote}>不用一次想完整，Meri 会陪你慢慢整理。</p>
      <div className={styles.companionScene} data-region="companion-scene">
        <Image alt="Meri 正在查看地图" className={styles.companion} height={256} width={384} src="/companion/home-v2-companion.png" />
      </div>
    </section>
  );
}
