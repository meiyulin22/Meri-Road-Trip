import Image from "next/image";

import type { CatalogPhoto } from "@/domain/catalog/catalog-photo";

import styles from "./catalog-photo-figure.module.css";

/**
 * A catalog spot's or dish's small photo (B1) with the credit its licence asks for: the author
 * and Commons page, and the licence. The photo decorates the card; it says nothing about the
 * place today, so it carries no caption beyond the name already on the card.
 */
export function CatalogPhotoFigure({ photo, name, size }: {
  readonly photo: CatalogPhoto;
  readonly name: string;
  readonly size: "spot" | "dish";
}) {
  return (
    <figure className={styles.figure} data-size={size}>
      <Image className={styles.image} src={photo.url} alt={name} width={photo.width} height={photo.height}
        sizes={size === "spot" ? "112px" : "80px"} />
      <figcaption className={styles.credit}>
        {/* The author links to the Commons file page, which names Wikimedia Commons and the full licence. */}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{photo.author}</a>
        {" · "}
        <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a>
      </figcaption>
    </figure>
  );
}
