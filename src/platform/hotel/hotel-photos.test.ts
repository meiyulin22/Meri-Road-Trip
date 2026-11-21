import assert from "node:assert/strict";
import test from "node:test";

import { hotelPreviewUrl } from "./hotel-photos";

test("the preview link names only the hotel and the stay's dates, never the partner tracking", () => {
  const url = hotelPreviewUrl(2437027, "2026-11-28", 2);
  assert.equal(url, "https://rollinggo.cn/pages/hotel/detail/index?id=2437027&checkInDate=2026-11-28&checkOutDate=2026-11-30&roomCount=1&adultCount=2&childCount=0");
  assert.ok(!url.includes("utm"));
  assert.match(hotelPreviewUrl(1, "2026-12-31", 1), /checkOutDate=2027-01-01/u);
});
