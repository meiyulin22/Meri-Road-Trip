export type OfficialAccessSearchResult = {
  readonly title: string;
  readonly url: string;
  readonly siteName: string;
  readonly snippet: string;
  readonly summary?: string;
  readonly publishedAt?: string;
  readonly lastCrawledAt?: string;
};

export interface OfficialAccessSearch {
  search(query: string): Promise<readonly OfficialAccessSearchResult[]>;
}
