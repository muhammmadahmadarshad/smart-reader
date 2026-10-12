import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
@Injectable()
export class UsersService {
  constructor(private readonly db: DataSource) {}
  findByEmail(email: string) {
    return this.db
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }
  create(email: string, passwordHash: string) {
    return this.db.getRepository(User).save({ email: email.trim().toLowerCase(), passwordHash });
  }
}
