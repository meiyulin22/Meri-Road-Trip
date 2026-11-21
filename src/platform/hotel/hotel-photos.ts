/** Where RollingGo's hotel photos come from (1.2117 stays), for next/image and the adapter's URL check. */
export const hotelPhotoHost = "image-cdn.rollinggo.cn";

const dayMs = 24 * 60 * 60 * 1_000;

/**
 * A plain link to the hotel's public page on RollingGo for the stay's dates (merlin, 2026-11-21):
 * only the hotel and the dates, never the partner tracking (`utm_source`) its search results carry,
 * so Meri earns nothing from it and stays non-commercial. The page needs a login to book.
 */
export function hotelPreviewUrl(hotelId: number, checkIn: string, nights: number): string {
  const checkOut = new Date(Date.parse(checkIn + "T00:00:00Z") + Math.max(1, nights) * dayMs).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    id: String(hotelId), checkInDate: checkIn, checkOutDate: checkOut, roomCount: "1", adultCount: "2", childCount: "0",
  });
  return `https://rollinggo.cn/pages/hotel/detail/index?${query}`;
}
