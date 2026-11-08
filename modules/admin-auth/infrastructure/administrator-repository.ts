import { Kysely } from "kysely";

import type { AdministratorRow, Database } from "@/lib/db/types";

/** The non-sensitive projection safe to pass to the client. */
export interface AdministratorSummary {
  id: string;
  email: string;
  name: string;
}

export class AdministratorRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findByEmail(email: string): Promise<AdministratorRow | null> {
    return (
      (await this.db
        .selectFrom("administrators")
        .selectAll()
        .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
        .executeTakeFirst()) ?? null
    );
  }

  /** Deliberately never selects `password_hash`. */
  async findById(id: string): Promise<AdministratorSummary | null> {
    return (
      (await this.db
        .selectFrom("administrators")
        .select(["id", "email", "name"])
        .where("id", "=", id)
        .executeTakeFirst()) ?? null
    );
  }

  async create(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<AdministratorRow> {
    return this.db
      .insertInto("administrators")
      .values({
        email: input.email,
        name: input.name,
        password_hash: input.passwordHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .updateTable("administrators")
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where("id", "=", id)
      .executeTakeFirst();
  }
}