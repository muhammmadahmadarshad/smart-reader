export type Bookmark = {
  id: string;
  bookId: string;
  page: number;
  label: string;
  createdAt: string;
};
export type SearchMatch = { page: number; offset: number; snippet: string };
export type TextSelection = {
  bookId: string;
  page: number;
  text: string;
  rectangles: { x: number; y: number; width: number; height: number }[];
  anchor?: { x: number; y: number };
};
export type Annotation = {
  id: string;
  bookId: string;
  kind: 'HIGHLIGHT' | 'NOTE';
  selectedText: string | null;
  noteText: string | null;
  color: string | null;
  documentVersion: string | null;
  coordinateVersion: number | null;
  segments: { page: number; rectangles: TextSelection['rectangles'] }[] | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type AnnotationList = { items: Annotation[]; total: number; page: number; pageSize: number };
