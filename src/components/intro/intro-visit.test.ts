import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { INTRO_VISIT_BOOTSTRAP, INTRO_VISIT_STORAGE_KEY, rememberIntroVisit, shouldVisitIntro } from "./intro-visit";

type StorageFailure = "access" | "read" | "write";

function browser(options: { pathname?: string; visited?: string; failure?: StorageFailure; replaceFails?: boolean } = {}) {
  const stored = new Map<string, string>(options.visited === undefined ? [] : [[INTRO_VISIT_STORAGE_KEY, options.visited]]);
  const events: string[] = [];
  const storage = {
    getItem(key: string) {
      if (options.failure === "read") throw new Error("Storage read unavailable");
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.failure === "write") throw new Error("Storage write unavailable");
      stored.set(key, value);
      events.push("remember");
    },
  };
  const readStorage = () => {
    if (options.failure === "access") throw new Error("Storage getter unavailable");
    return storage;
  };
  const context = {
    get localStorage() { return readStorage(); },
    location: {
      pathname: options.pathname ?? "/",
      replace(pathname: string) {
        events.push(`replace:${pathname}`);
        if (options.replaceFails) throw new Error("Navigation unavailable");
        this.pathname = pathname;
      },
    },
  };
  return { stored, events, readStorage, context, run: () => runInNewContext(INTRO_VISIT_BOOTSTRAP, context) };
}

test("the first Home visit is remembered before replacing its history entry with Intro", () => {
  const page = browser();
  page.run();
  assert.equal(page.stored.get(INTRO_VISIT_STORAGE_KEY), "seen");
  assert.deepEqual(page.events, ["remember", "replace:/intro"]);
});

test("any existing visit record skips Intro, including an empty or older value", () => {
  for (const visited of ["seen", "", "false", "older-version"]) {
    const page = browser({ visited });
    page.run();
    assert.deepEqual(page.events, []);
    assert.equal(shouldVisitIntro(page.readStorage), false);
  }
});

test("Intro and other direct routes do not redirect or claim a Home visit", () => {
  for (const pathname of ["/intro", "/trips", "/trips/journey", "/trips/new"]) {
    const page = browser({ pathname });
    page.run();
    assert.equal(page.stored.size, 0);
    assert.deepEqual(page.events, []);
  }
});

for (const failure of ["access", "read", "write"] as const) {
  test(`a storage ${failure} failure keeps Home usable without a redirect`, () => {
    const page = browser({ failure });
    assert.doesNotThrow(page.run);
    assert.equal(shouldVisitIntro(page.readStorage), false);
    assert.equal(page.stored.size, 0);
    assert.deepEqual(page.events, []);
  });
}

test("exiting Intro to Home does not redirect back to Intro", () => {
  const page = browser();
  page.run();
  page.run();
  page.context.location.pathname = "/";
  page.run();
  assert.deepEqual(page.events, ["remember", "replace:/intro"]);
});

test("client navigation can reuse the same claim, once only", () => {
  const page = browser();
  assert.equal(shouldVisitIntro(page.readStorage), true);
  assert.equal(shouldVisitIntro(page.readStorage), false);
  page.run();
  assert.deepEqual(page.events, ["remember"]);
});

test("a direct Intro visit and its exit action can remember the visit safely", () => {
  const page = browser({ pathname: "/intro" });
  rememberIntroVisit(page.readStorage);
  rememberIntroVisit(page.readStorage);
  page.context.location.pathname = "/";
  page.run();
  assert.equal(page.stored.get(INTRO_VISIT_STORAGE_KEY), "seen");
  assert.deepEqual(page.events, ["remember", "remember"]);
});

test("remembering a visit tolerates an unavailable storage getter or failed write", () => {
  for (const failure of ["access", "write"] as const) {
    const page = browser({ failure });
    assert.doesNotThrow(() => rememberIntroVisit(page.readStorage));
    assert.equal(page.stored.size, 0);
  }
});

test("a failed location replacement does not throw or create a redirect loop", () => {
  const page = browser({ replaceFails: true });
  assert.doesNotThrow(page.run);
  assert.doesNotThrow(page.run);
  assert.deepEqual(page.events, ["remember", "replace:/intro"]);
});
