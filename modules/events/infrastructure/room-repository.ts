import { sql, type Kysely } from "kysely";

import { generatePublicId } from "@/lib/ids";
import type { Database, NewRoom, RoomRow } from "@/lib/db/types";

export interface RoomInput {
  name: string;
  description: string | null;
}

export class RoomRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: RoomInput): Promise<RoomRow> {
    return this.db
      .insertInto("rooms")
      .values({
        public_id: generatePublicId(),
        name: input.name,
        description: input.description,
      } satisfies NewRoom)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(roomId: string, input: RoomInput): Promise<void> {
    await this.db
      .updateTable("rooms")
      .set({ ...input, updated_at: new Date() })
      .where("id", "=", roomId)
      .execute();
  }

  async findById(id: string): Promise<RoomRow | null> {
    const room = await this.db
      .selectFrom("rooms")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return room ?? null;
  }

  async findByPublicId(publicId: string): Promise<RoomRow | null> {
    const room = await this.db
      .selectFrom("rooms")
      .selectAll()
      .where("public_id", "=", publicId)
      .executeTakeFirst();

    return room ?? null;
  }

  async findByName(name: string, exceptId?: string): Promise<RoomRow | null> {
    let query = this.db
      .selectFrom("rooms")
      .selectAll()
      .where(sql<boolean>`lower(trim(name)) = lower(trim(${name}))`);

    if (exceptId) query = query.where("id", "!=", exceptId);

    const room = await query.executeTakeFirst();
    return room ?? null;
  }

  async listForAdmin(): Promise<RoomRow[]> {
    return this.db
      .selectFrom("rooms")
      .selectAll()
      .orderBy("name", "asc")
      .orderBy("id", "asc")
      .execute();
  }

  /** Only expose rooms that currently have at least one published event. */
  async listForPublic(): Promise<Array<Pick<RoomRow, "public_id" | "name">>> {
    return this.db
      .selectFrom("rooms")
      .innerJoin("events", "events.room_id", "rooms.id")
      .select(["rooms.public_id", "rooms.name"])
      .distinct()
      .where("events.publication_status", "=", "published")
      .orderBy("rooms.name", "asc")
      .execute();
  }
}
