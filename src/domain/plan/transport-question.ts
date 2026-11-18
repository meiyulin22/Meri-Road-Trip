import type { PlanQuestion } from "./plan-progress";
import type { FlightOption, TrainOption } from "./transfer-legs";

/**
 * The transport question (1.2112): the traveller chose the train, but setting off or heading home
 * takes more than this on the quickest train found, and a flight exists. Code writes the question
 * from the real timetable and fares; the transport agent only says whether it is worth asking.
 */
export const longTrainMinutes = 12 * 60;

/** How the traveller answered: keep the train, fly instead, or let Meri pick ("你来定"). */
export type TransportAnswer = "train" | "flight" | "auto";

const optionLabels = {
  zh: { train: "坚持坐火车", flight: "改坐飞机" },
  en: { train: "Stay on the train", flight: "Fly instead" },
} as const;

/**
 * Words showing the traveller already said something about trains or flying (a sleeper, a fear of
 * flying). Without any, code asks whatever the agent says, as in 1.2018: the model may not decide
 * for a traveller who never said.
 */
const travelModeWords = /火车|高铁|动车|卧铺|硬座|软座|列车|飞机|航班|机票|坐飞|恐飞|晕机|train|rail|sleeper|fly|flight|plane|airport/iu;

export function mentionsTravelMode(preferences: readonly string[]): boolean {
  return preferences.some((quote) => travelModeWords.test(quote));
}

/** One leg the question is about: the quickest train and the quickest flight found for it. */
export type AskedLeg = {
  readonly kind: "outbound" | "return";
  readonly train: TrainOption;
  readonly flight: FlightOption;
};

function duration(minutes: number, zh: boolean): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (zh) return rest === 0 ? `${hours}小时` : `${hours}小时${rest}分`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const maxQuestionLength = 120;

function questionText(legs: readonly AskedLeg[], zh: boolean, codes: boolean): string {
  const train = ({ train: option }: AskedLeg) => `${duration(option.durationMinutes, zh)}${codes ? (zh ? `（${option.code}）` : ` (${option.code})`) : ""}`;
  const flight = ({ flight: option }: AskedLeg) => zh
    ? `${codes ? ` ${option.flightNo} ` : ""}约${duration(option.durationMinutes, zh)}、¥${option.price}`
    : `${codes ? `${option.flightNo} ` : ""}${duration(option.durationMinutes, zh)}, ¥${option.price}`;
  if (legs.length === 1) {
    const [leg] = legs;
    return zh
      ? `${leg.kind === "outbound" ? "去程" : "回程"}火车最快也要${train(leg)}，飞机${flight(leg)}。怎么走？`
      : `The quickest train ${leg.kind === "outbound" ? "there" : "home"} takes ${train(leg)}; a flight ${flight(leg)}. Train or plane?`;
  }
  const [out, back] = legs;
  return zh
    ? `去程火车最快${train(out)}，飞机${flight(out)}；回程火车最快${train(back)}，飞机${flight(back)}。怎么走？`
    : `Trains: ${train(out)} there, ${train(back)} back. Flights: ${flight(out)} there, ${flight(back)} back. Train or plane?`;
}

/**
 * The question, written by code from what was found: one question for setting off and heading home
 * together, with the two fixed options; "you decide" is the card's own button. The train and flight
 * codes are left out when the text would be too long for the card.
 */
export function transportQuestion(legs: readonly AskedLeg[], locale: "zh" | "en"): Omit<PlanQuestion, "id"> {
  const zh = locale === "zh";
  const full = questionText(legs, zh, true);
  const text = full.length <= maxQuestionLength ? full : questionText(legs, zh, false).slice(0, maxQuestionLength);
  const labels = optionLabels[locale];
  return {
    text,
    step: "transfer-legs",
    options: [
      { label: labels.train, kind: "other", pace: null, leaveOut: null },
      { label: labels.flight, kind: "other", pace: null, leaveOut: null },
    ],
  };
}

/** The answer an option's label stands for; null ("you decide") or anything else lets Meri pick. */
export function transportAnswerOf(choice: string | null): TransportAnswer {
  if (choice === optionLabels.zh.train || choice === optionLabels.en.train) return "train";
  if (choice === optionLabels.zh.flight || choice === optionLabels.en.flight) return "flight";
  return "auto";
}
