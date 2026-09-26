"use client";

import Image from "next/image";
import { useState } from "react";

import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { destinationImageUrl } from "./destination-recommendation-model";

import styles from "./destination-recommendation-card.module.css";

type Destination = DestinationRecommendationPresentation["destinations"][number];

export function DestinationRecommendationCard({
  destination, onSelect, pending, selected, error,
}: {
  readonly destination: Destination;
  readonly onSelect: () => void;
  readonly pending: boolean;
  readonly selected: boolean;
  readonly error: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = destinationImageUrl(destination.imageUrl, imageFailed);

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Image
          alt=""
          className={styles.image}
          fill
          onError={() => setImageFailed(true)}
          sizes="(max-width: 640px) 90vw, 240px"
          src={imageUrl}
          unoptimized={destination.imageUrl !== null}
        />
        <span className={styles.insetLabel}>目的地灵感</span>
      </div>
      <div className={styles.content}>
        <h3>{destination.name}</h3>
        {destination.region ? <span className={styles.region}>{destination.region}</span> : null}
        <p>{destination.reason}</p>
        <button disabled={pending || selected} onClick={onSelect} type="button">
          {selected ? "已选择" : pending ? "保存中…" : "选择这个目的地"}
        </button>
        {error ? <span className={styles.error} role="alert">保存失败，请重试。</span> : null}
      </div>
    </article>
  );
}
