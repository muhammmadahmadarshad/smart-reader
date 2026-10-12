export type Bookmark = {
  id: string;
  bookId: string;
  page: number;
  label: string;
  createdAt: string;
};
export type SearchMatch = { page: number; offset: number; snippet: string };
export type Highlight = TextSelection & { id: string; createdAt: string };
export type TextSelection = {
  bookId: string;
  page: number;
  text: string;
  rectangles: { x: number; y: number; width: number; height: number }[];
};
