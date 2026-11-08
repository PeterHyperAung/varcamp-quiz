import { Kysely } from "kysely";

import { generatePublicId } from "@/lib/ids";
import type {
  Database,
  EventRow,
  NewEvent,
  PublicationStatus,
} from "@/lib/db/types";

export interface EventScheduleInput {
  title: string;
  description: string | null;
  location: string | null;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  publicationStatus: PublicationStatus;
}

export type EventWithRoom = EventRow & {
  room_name: string | null;
  room_public_id: string | null;
};

export class EventRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: EventScheduleInput): Promise<EventRow> {
    return this.db
      .insertInto("events")
      .values({
        public_id: generatePublicId(),
        title: input.title,
        description: input.description,
        location: input.location,
        room_id: input.roomId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.timezone,
        publication_status: input.publicationStatus,
      } satisfies NewEvent)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(eventId: string, input: EventScheduleInput): Promise<void> {
    await this.db
      .updateTable("events")
      .set({
        title: input.title,
        description: input.description,
        location: input.location,
        room_id: input.roomId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.timezone,
        publication_status: input.publicationStatus,
        updated_at: new Date(),
      })
      .where("id", "=", eventId)
      .execute();
  }

  async findById(id: string): Promise<EventWithRoom | null> {
    const event = await this.db
      .selectFrom("events")
      .leftJoin("rooms", "rooms.id", "events.room_id")
      .selectAll("events")
      .select(["rooms.name as room_name", "rooms.public_id as room_public_id"])
      .where("events.id", "=", id)
      .executeTakeFirst();

    return event ?? null;
  }

  async findByPublicId(publicId: string): Promise<EventWithRoom | null> {
    const event = await this.db
      .selectFrom("events")
      .leftJoin("rooms", "rooms.id", "events.room_id")
      .selectAll("events")
      .select(["rooms.name as room_name", "rooms.public_id as room_public_id"])
      .where("events.public_id", "=", publicId)
      .executeTakeFirst();

    return event ?? null;
  }

  async setPublicationStatus(
    eventId: string,
    publicationStatus: PublicationStatus,
  ): Promise<void> {
    await this.db
      .updateTable("events")
      .set({ publication_status: publicationStatus, updated_at: new Date() })
      .where("id", "=", eventId)
      .execute();
  }

  /**
   * The public timetable: published events only, ordered deterministically.
   *
   * Ordering happens in the database using the same rule as
   * `compareEventTimetableOrder`, so pagination and SSR agree with the client.
   */
  async listTimetable(options: {
    limit: number;
    offset: number;
    roomPublicId?: string;
  }): Promise<EventWithRoom[]> {
    let query = this.db
      .selectFrom("events")
      .leftJoin("rooms", "rooms.id", "events.room_id")
      .selectAll("events")
      .select(["rooms.name as room_name", "rooms.public_id as room_public_id"])
      .where("events.publication_status", "=", "published");

    if (options.roomPublicId) {
      query = query.where("rooms.public_id", "=", options.roomPublicId);
    }

    return query
      .orderBy("events.starts_at", "asc")
      .orderBy("events.ends_at", "asc")
      .orderBy("events.id", "asc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();
  }

  async countPublished(roomPublicId?: string): Promise<number> {
    let query = this.db
      .selectFrom("events")
      .leftJoin("rooms", "rooms.id", "events.room_id")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("events.publication_status", "=", "published");

    if (roomPublicId) {
      query = query.where("rooms.public_id", "=", roomPublicId);
    }

    const row = await query.executeTakeFirstOrThrow();

    return Number(row.count);
  }

  async listForAdmin(options: {
    limit: number;
    offset: number;
  }): Promise<{ rows: EventWithRoom[]; total: number }> {
    const rows = await this.db
      .selectFrom("events")
      .leftJoin("rooms", "rooms.id", "events.room_id")
      .selectAll("events")
      .select(["rooms.name as room_name", "rooms.public_id as room_public_id"])
      .orderBy("events.starts_at", "asc")
      .orderBy("events.id", "asc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();

    const countRow = await this.db
      .selectFrom("events")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();

    return { rows, total: Number(countRow.count) };
  }
}
