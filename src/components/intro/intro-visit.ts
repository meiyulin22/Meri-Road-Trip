export const INTRO_VISIT_STORAGE_KEY = "meri:intro-visited";

type IntroStorage = Pick<Storage, "getItem" | "setItem">;
type ReadIntroStorage = () => IntroStorage;

/** Claim the first visit before navigating, so returning Home cannot reopen Intro. */
export function shouldVisitIntro(
  readStorage: ReadIntroStorage = () => window.localStorage,
  storageKey: string = INTRO_VISIT_STORAGE_KEY,
): boolean {
  try {
    const storage = readStorage();
    if (storage.getItem(storageKey) !== null) return false;
    storage.setItem(storageKey, "seen");
    return true;
  } catch {
    return false;
  }
}

/** Direct Intro visits and its exit action remember the visit without blocking navigation. */
export function rememberIntroVisit(readStorage: ReadIntroStorage = () => window.localStorage): void {
  try {
    readStorage().setItem(INTRO_VISIT_STORAGE_KEY, "seen");
  } catch {
    // Storage is optional; a visitor must always be able to reach Home.
  }
}

// Pass both arguments so the serialized function has no module-scope dependencies.
export const INTRO_VISIT_BOOTSTRAP = `(function(){try{
  if(location.pathname!=="/")return;
  if((${shouldVisitIntro.toString()})(function(){return localStorage;},${JSON.stringify(INTRO_VISIT_STORAGE_KEY)}))location.replace("/intro");
}catch{}})();`;
