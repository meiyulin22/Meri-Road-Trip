import type { Metadata } from "next";

import { messages } from "@/components/i18n/messages";
import { IntroPage } from "@/components/intro/intro-page";
import { loadIntroPhotos } from "@/components/intro/intro-photos";
import { requestLocale } from "@/platform/locale/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  const text = messages[await requestLocale()].intro;
  return { title: text.pageTitle, description: text.description };
}

export default function Intro() {
  return <IntroPage photos={loadIntroPhotos()} />;
}
