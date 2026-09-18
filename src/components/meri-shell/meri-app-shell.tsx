import {
  Backpack,
  CloudSun,
  Compass,
  Home,
  Map,
  MountainSnow,
  Plus,
  Send,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";

import styles from "./meri-app-shell.module.css";

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  available: boolean;
};

const desktopNavigation: NavigationItem[] = [
  { label: "Home", icon: Home, available: true },
  { label: "Trips", icon: Backpack, available: false },
  { label: "Explore", icon: Compass, available: false },
  { label: "Map", icon: Map, available: false },
  { label: "Weather", icon: CloudSun, available: false },
  { label: "Profile", icon: UserRound, available: false },
];

const mobileNavigation = desktopNavigation.filter(({ label }) =>
  ["Home", "Trips", "Explore", "Profile"].includes(label),
);

const promptExamples = [
  "今年冬天想找个地方滑雪",
  "从大连去云南玩，大概一周",
  "想去日本看樱花，有什么推荐？",
];

const tripMoods = ["灵活一点", "给我惊喜", "滑雪旅行", "周末徒步"];

export function MeriAppShell() {
  return (
    <main className={styles.appShell}>
      <DesktopSidebar />
      <MobileHeader />
      <JourneyWorld />
      <MobileBottomNavigation />
    </main>
  );
}

function MeriBrand({ compact = false }: { compact?: boolean }) {
  const asset = compact
    ? { src: "/brand/meri-wordmark.svg", width: 1101, height: 329 }
    : { src: "/brand/meri-lockup.svg", width: 640, height: 500 };

  return (
    <a
      aria-label="Meri home"
      className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}
      href="#top"
    >
      <Image
        alt=""
        className={styles.brandAsset}
        height={asset.height}
        src={asset.src}
        width={asset.width}
      />
    </a>
  );
}

function DesktopSidebar() {
  return (
    <aside className={styles.desktopSidebar} aria-label="Meri sidebar">
      <div className={styles.sidebarBrand}>
        <MeriBrand />
        <p>Plan Less</p>
        <p>Explore More</p>
      </div>

      <a className={styles.newTripButton} href="#new-trip">
        <Plus aria-hidden="true" size={20} />
        <span>New Trip</span>
      </a>

      <nav className={styles.primaryNavigation} aria-label="Primary navigation">
        {desktopNavigation.map((item) => (
          <NavigationEntry item={item} key={item.label} />
        ))}
      </nav>

      <section className={styles.recentTrips} aria-labelledby="recent-trips-title">
        <div className={styles.sectionHeading}>
          <h2 id="recent-trips-title">Recent Trips</h2>
          <span aria-hidden="true">+</span>
        </div>
        <div className={styles.emptyTrips}>
          <Sparkles aria-hidden="true" size={18} />
          <p>Your saved trips will appear here.</p>
        </div>
      </section>

      <p className={styles.sidebarMotto}>
        <MountainSnow aria-hidden="true" size={25} strokeWidth={1.5} />
        <span>A brighter journey together</span>
      </p>
    </aside>
  );
}

function NavigationEntry({ item }: { item: NavigationItem }) {
  const Icon = item.icon;

  if (item.available) {
    return (
      <a className={`${styles.navItem} ${styles.navItemActive}`} href="#top">
        <Icon aria-hidden="true" size={19} />
        <span>{item.label}</span>
      </a>
    );
  }

  return (
    <span className={`${styles.navItem} ${styles.navItemDisabled}`} aria-disabled="true">
      <Icon aria-hidden="true" size={19} />
      <span>{item.label}</span>
      <span className={styles.soonLabel}>Soon</span>
    </span>
  );
}

function MobileHeader() {
  return (
    <header className={styles.mobileHeader}>
      <MeriBrand compact />
      <a className={styles.mobileNewTrip} href="#new-trip">
        <Plus aria-hidden="true" size={17} />
        <span>New Trip</span>
      </a>
    </header>
  );
}

function JourneyWorld() {
  return (
    <section className={styles.journeyWorld} id="top" aria-label="Meri World">
      <picture className={styles.artworkFrame}>
        <source
          media="(min-width: 1100px)"
          srcSet="/companion/backgrounds/meri-world-desktop.png"
        />
        <source
          media="(max-width: 1099px)"
          srcSet="/companion/backgrounds/meri-world-mobile.png"
        />
        <img
          alt=""
          className={styles.worldArtwork}
          decoding="async"
          fetchPriority="high"
          height={1672}
          src="/companion/backgrounds/meri-world-mobile.png"
          width={940}
        />
      </picture>
      <div className={styles.worldReadability} aria-hidden="true" />

      <div className={styles.worldContent}>
        <ProductIntroduction />
        <div className={styles.companionReserve} aria-hidden="true" />
        <NewTripComposer />
      </div>
    </section>
  );
}

function ProductIntroduction() {
  return (
    <header className={styles.productIntroduction}>
      <p className={styles.productKicker}>The world is waiting</p>
      <h1 className={styles.productName}>
        <Image
          alt="Meri"
          className={styles.productWordmark}
          height={329}
          src="/brand/meri-wordmark.svg"
          width={1101}
        />
      </h1>
      <p>Your Outdoor Travel Companion</p>
    </header>
  );
}

function NewTripComposer() {
  return (
    <section className={styles.composer} id="new-trip" aria-labelledby="composer-title">
      <div className={styles.composerHeading}>
        <div>
          <p className={styles.composerEyebrow}>Start with an idea</p>
          <h2 id="composer-title">Where would you like to go?</h2>
        </div>
        <span className={styles.visualOnlyLabel}>Preview</span>
      </div>

      <label className={styles.composerInput}>
        <span className={styles.srOnly}>Tell Meri your travel idea</span>
        <textarea
          aria-describedby="composer-preview-note"
          placeholder="Tell Meri your travel idea..."
          rows={1}
        />
        <button
          aria-label="Trip idea submission will be available in the next phase"
          disabled
          type="button"
        >
          <Send aria-hidden="true" size={21} />
        </button>
      </label>

      <div className={styles.promptExamples} aria-label="Example trip ideas">
        {promptExamples.map((prompt) => (
          <span key={prompt}>{prompt}</span>
        ))}
      </div>

      <div className={styles.tripMoods} aria-label="Trip inspiration examples">
        {tripMoods.map((mood) => (
          <span key={mood}>{mood}</span>
        ))}
      </div>

      <p className={styles.previewNote} id="composer-preview-note">
        Trip planning becomes interactive in the next phase.
      </p>
    </section>
  );
}

function MobileBottomNavigation() {
  return (
    <nav className={styles.mobileBottomNavigation} aria-label="Mobile navigation">
      {mobileNavigation.map((item) => {
        const Icon = item.icon;

        if (item.available) {
          return (
            <a className={styles.mobileNavActive} href="#top" key={item.label}>
              <Icon aria-hidden="true" size={21} />
              <span>{item.label}</span>
            </a>
          );
        }

        return (
          <span aria-disabled="true" key={item.label} title="Not available yet">
            <Icon aria-hidden="true" size={21} />
            <span>{item.label}</span>
          </span>
        );
      })}
    </nav>
  );
}
