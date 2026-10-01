import Image from "next/image";

import styles from "./trip-workspace.module.css";

export function MeriWorld() {
  return (
    <section className={styles.meriWorld} aria-label="Meri companion" data-region="meri-world">
      <p className={styles.companionNote}>不用一次想完整，Meri 会陪你慢慢整理。</p>
      <div className={styles.companionScene} data-region="companion-scene">
        <Image alt="Meri 正在查看地图" className={styles.companion} height={256} width={384} src="/companion/home-v2-companion.png" />
      </div>
    </section>
  );
}
