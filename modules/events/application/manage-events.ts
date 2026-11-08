import type { Kysely } from "kysely";

import { systemClock, type Clock } from "@/lib/clock";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Database, EventRow, PublicationStatus, RoomRow } from "@/lib/db/types";
import {
  eventInputSchema,
  parseEventInstant,
  roomInputSchema,
} from "@/lib/validation/events";
import {
  assertEventTitle,
  compareEventTimetableOrder,
  deriveScheduleStatus,
  isValidTimeZone,
  validateEventSchedule,
  type EventScheduleStatus,
} from "../domain/schedule";
import {
  EventRepository,
  type EventWithRoom,
  type EventScheduleInput,
} from "../infrastructure/event-repository";
import { RoomRepository } from "../infrastructure/room-repository";

export interface RoomView {
  publicId: string;
  name: string;
  description: string | null;
}

export interface PublicRoomView {
  publicId: string;
  name: string;
}

export interface TimetableEntry extends EventWithRoom {
  scheduleStatus: EventScheduleStatus;
}

export interface PublicEventView extends EventWithRoom {
  scheduleStatus: EventScheduleStatus;
}

export class ManageEvents {
  private readonly events: EventRepository;
  private readonly rooms: RoomRepository;

  constructor(
    db: Kysely<Database>,
    private readonly clock: Clock = systemClock,
  ) {
    this.events = new EventRepository(db);
    this.rooms = new RoomRepository(db);
  }

  async create(rawInput: unknown): Promise<EventRow> {
    const input = eventInputSchema.parse(rawInput);
    assertEventTitle(input.title);

    return this.events.create(await this.toScheduleInput(input));
  }

  async update(eventId: string, rawInput: unknown): Promise<void> {
    const input = eventInputSchema.parse(rawInput);
    assertEventTitle(input.title);

    const existing = await this.events.findById(eventId);
    if (!existing) throw new NotFoundError("Event not found.");

    await this.events.update(eventId, await this.toScheduleInput(input));
  }

  async createRoom(rawInput: unknown): Promise<RoomView> {
    const input = roomInputSchema.parse(rawInput);
    await this.assertRoomNameAvailable(input.name);

    try {
      const room = await this.rooms.create({
        name: input.name,
        description: input.description || null,
      });
      return this.toRoomView(room);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateRoomNameError();
      throw error;
    }
  }

  async updateRoom(publicId: string, rawInput: unknown): Promise<void> {
    const input = roomInputSchema.parse(rawInput);
    const room = await this.rooms.findByPublicId(publicId);
    if (!room) throw new NotFoundError("Room not found.");
    await this.assertRoomNameAvailable(input.name, room.id);

    try {
      await this.rooms.update(room.id, {
        name: input.name,
        description: input.description || null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateRoomNameError();
      throw error;
    }
  }

  async listRoomsForAdmin(): Promise<RoomView[]> {
    return (await this.rooms.listForAdmin()).map((room) => this.toRoomView(room));
  }

  async listPublicRooms(): Promise<PublicRoomView[]> {
    return (await this.rooms.listForPublic()).map((room) => ({
      publicId: room.public_id,
      name: room.name,
    }));
  }

  async setPublicationStatus(
    eventId: string,
    publicationStatus: PublicationStatus,
  ): Promise<void> {
    const existing = await this.events.findById(eventId);
    if (!existing) throw new NotFoundError("Event not found.");

    await this.events.setPublicationStatus(eventId, publicationStatus);
  }

  async getForAdmin(
    eventId: string,
  ): Promise<EventWithRoom & { scheduleStatus: EventScheduleStatus }> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError("Event not found.");

    return { ...event, scheduleStatus: this.statusOf(event, this.clock.now()) };
  }

  async listForAdmin(options: {
    limit: number;
    offset: number;
  }): Promise<{
    rows: Array<EventWithRoom & { scheduleStatus: EventScheduleStatus }>;
    total: number;
  }> {
    const { rows, total } = await this.events.listForAdmin(options);
    const now = this.clock.now();

    return {
      rows: rows.map((row) => ({ ...row, scheduleStatus: this.statusOf(row, now) })),
      total,
    };
  }

  /**
   * The public timetable.
   *
   * Only published events are returned, and schedule status is derived from the
   * current time rather than stored. A room filter uses its opaque public id.
   */
  async getPublicTimetable(options: {
    limit: number;
    offset?: number;
    roomPublicId?: string;
  }): Promise<{ entries: TimetableEntry[]; total: number }> {
    const now = this.clock.now();

    const [rows, total] = await Promise.all([
      this.events.listTimetable({
        limit: options.limit,
        offset: options.offset ?? 0,
        roomPublicId: options.roomPublicId,
      }),
      this.events.countPublished(options.roomPublicId),
    ]);

    const entries = rows
      .map((row) => ({ ...row, scheduleStatus: this.statusOf(row, now) }))
      .sort((a, b) =>
        compareEventTimetableOrder(
          { startsAt: a.starts_at, endsAt: a.ends_at, id: a.id },
          { startsAt: b.starts_at, endsAt: b.ends_at, id: b.id },
        ),
      );

    return { entries, total };
  }

  /** A single public event. Unpublished events are treated as not found. */
  async getPublicEvent(publicId: string): Promise<PublicEventView | null> {
    const event = await this.events.findByPublicId(publicId);
    if (!event || event.publication_status !== "published") return null;

    return { ...event, scheduleStatus: this.statusOf(event, this.clock.now()) };
  }

  private statusOf(
    event: Pick<EventRow, "starts_at" | "ends_at">,
    now: Date,
  ): EventScheduleStatus {
    return deriveScheduleStatus(
      { startsAt: event.starts_at, endsAt: event.ends_at },
      now,
    );
  }

  private async toScheduleInput(
    input: ReturnType<typeof eventInputSchema.parse>,
  ): Promise<EventScheduleInput> {
    // Validate the timezone *before* converting: `Intl.DateTimeFormat` throws a
    // raw RangeError for an unknown zone, which would otherwise escape as an
    // unexpected error instead of a user-facing field error.
    if (!isValidTimeZone(input.timezone)) {
      throw new ValidationError("This event's schedule is not valid.", {
        timezone: ["Enter a valid IANA timezone, for example Asia/Yangon."],
      });
    }

    // The form sends wall-clock times in the event's own timezone; converting to
    // an absolute instant here means the server's local timezone is irrelevant.
    const startsAt = parseEventInstant(input.startsAt, input.timezone);
    const endsAt = parseEventInstant(input.endsAt, input.timezone);

    validateEventSchedule({ startsAt, endsAt, timezone: input.timezone });

    let roomId: string | null = null;
    if (input.roomPublicId) {
      const room = await this.rooms.findByPublicId(input.roomPublicId);
      if (!room) {
        throw new ValidationError("Select a valid room.", {
          roomPublicId: ["Choose an available room."],
        });
      }
      roomId = room.id;
    }

    return {
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      roomId,
      startsAt,
      endsAt,
      timezone: input.timezone,
      publicationStatus: input.publicationStatus,
    };
  }

  private async assertRoomNameAvailable(name: string, exceptId?: string): Promise<void> {
    if (await this.rooms.findByName(name, exceptId)) {
      throw duplicateRoomNameError();
    }
  }

  private toRoomView(room: RoomRow): RoomView {
    return {
      publicId: room.public_id,
      name: room.name,
      description: room.description,
    };
  }
}

function duplicateRoomNameError(): ValidationError {
  return new ValidationError("A room with this name already exists.", {
    name: ["Choose a unique room name."],
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
