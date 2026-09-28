export type DestinationImageSearchResult = {
  readonly contentUrl: string;
  readonly hostPageUrl: string;
  readonly width?: number;
  readonly height?: number;
};

export interface DestinationImageSearch {
  search(query: string): Promise<readonly DestinationImageSearchResult[]>;
}
