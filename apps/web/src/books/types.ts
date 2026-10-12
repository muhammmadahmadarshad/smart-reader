export type Book = {
  id: string;
  title: string;
  size: number;
  pageCount: number | null;
  status: 'READY' | 'UPLOADING' | 'FAILED' | 'DELETING';
  createdAt: string;
  lastOpenedAt: string | null;
  progress: { page: number; updatedAt: string } | null;
};
export type BookList = { items: Book[]; total: number; page: number; pageSize: number };
export const formatSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
export const formatDate = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date))
    : 'Not opened yet';
