import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { Book } from '../books/entities/book.entity';
import { ReadingProgress } from '../reading-progress/entities/reading-progress.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Highlight } from '../highlights/entities/highlight.entity';
import { Annotation } from '../annotations/entities/annotation.entity';
import { aiEntities } from '../ai/entities/ai.entities';
export const databaseOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Session,
    PasswordResetToken,
    Book,
    ReadingProgress,
    Bookmark,
    Highlight,
    Annotation,
    ...aiEntities,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  logging: false,
};
export default new DataSource(databaseOptions);
