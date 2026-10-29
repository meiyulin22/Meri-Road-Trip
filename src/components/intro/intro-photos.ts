import type { PlaceImage } from "@/domain/location/place-image";
import { loadPhotoCatalog } from "@/platform/place-photos/catalog-photo-provider";
import { photoFromCatalog } from "@/platform/place-photos/photo-catalog";

/** The same bundled city representatives appear on Intro and its credits page. */
export function loadIntroPhotos(): readonly { region: string; image: PlaceImage }[] {
  const catalog = loadPhotoCatalog();
  return ["大理白族自治州", "丽江市", "拉萨市"].flatMap((region) => {
    const image = photoFromCatalog(catalog, { kind: "scenic", region });
    return image ? [{ region, image }] : [];
  });
}
