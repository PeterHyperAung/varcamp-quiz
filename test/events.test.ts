import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";

import { fixedClock } from "@/lib/clock";
import { ValidationError } from "@/lib/errors";
import type { Database } from "@/lib/db/types";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { createTestDb } from "./test-db";

/**
 * Integration tests for the independent events domain.
 *
 * Events deliberately have no relationship to quizzes: nothing here seeds or
 * touches quiz tables.
 */

let db: Kysely<Database>;
let destroy: () => Promise<void>;

const NOW = new Date("2026-03-01T12:00:00.000Z");
const clock = fixedClock(NOW.toISOString());

const HOUR = 60 * 60 * 1000;

function local(instant: Date): string {
  return instant.toISOString().slice(0, 16);
}

function eventInput(overrides: Partial<Parameters<ManageEvents["create"]>[0]> = {}) {
  return {
    title: "Opening Ceremony",
    description: "Welcome",
    location: "Main Hall",
    startsAt: local(new Date(NOW.getTime() + HOUR)),
    endsAt: local(new Date(NOW.getTime() + 3 * HOUR)),
    timezone: "UTC",
    publicationStatus: "published" as const,
    ...overrides,
  };
}

beforeEach(async () => {
  const harness = await createTestDb();
  db = harness.db;
  destroy = harness.destroy;
});

afterEach(async () => {
  await destroy();
});

describe("event creation", () => {
  it("stores an absolute instant regardless of the form's wall-clock zone", async () => {
    const manage = new ManageEvents(db, clock);

    // Asia/Yangon is UTC+06:30, so 09:00 local is 02:30 UTC.
    const event = await manage.create(
      eventInput({
        timezone: "Asia/Yangon",
        startsAt: "2026-03-01T09:00",
        endsAt: "2026-03-01T11:00",
      }),
    );

    expect(event.starts_at.toISOString()).toBe("2026-03-01T02:30:00.000Z");
    expect(event.ends_at.toISOString()).toBe("2026-03-01T04:30:00.000Z");
    expect(event.timezone).toBe("Asia/Yangon");
  });

  it("stores the same instant regardless of the timezone it was entered in", async () => {
    const manage = new ManageEvents(db, clock);

    const utc = await manage.create(
      eventInput({ timezone: "UTC", startsAt: "2026-03-01T10:00", endsAt: "2026-03-01T12:00" }),
    );

    // 16:30 in Yangon is the same instant as 10:00 UTC.
    const yangon = await manage.create(
      eventInput({
        timezone: "Asia/Yangon",
        startsAt: "2026-03-01T16:30",
        endsAt: "2026-03-01T18:30",
      }),
    );

    expect(yangon.starts_at.toISOString()).toBe(utc.starts_at.toISOString());
    expect(yangon.ends_at.toISOString()).toBe(utc.ends_at.toISOString());
  });

  it("rejects an end time at or before the start", async () => {
    const manage = new ManageEvents(db, clock);

    await expect(
      manage.create(eventInput({ startsAt: "2026-03-01T10:00", endsAt: "2026-03-01T09:00" })),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      manage.create(eventInput({ startsAt: "2026-03-01T10:00", endsAt: "2026-03-01T10:00" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an invalid timezone", async () => {
    const manage = new ManageEvents(db, clock);

    await expect(
      manage.create(eventInput({ timezone: "Nowhere/Special" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("public timetable", () => {
  it("shows only published events", async () => {
    const manage = new ManageEvents(db, clock);

    await manage.create(eventInput({ title: "Published" }));
    await manage.create(
      eventInput({ title: "Draft", publicationStatus: "draft" }),
    );
    await manage.create(
      eventInput({ title: "Archived", publicationStatus: "archived" }),
    );

    const { entries, total } = await manage.getPublicTimetable({ limit: 50 });

    expect(total).toBe(1);
    expect(entries.map((entry) => entry.title)).toEqual(["Published"]);
  });

  it("derives schedule status from the current time", async () => {
    const manage = new ManageEvents(db, clock);

    await manage.create(
      eventInput({
        title: "Finished",
        startsAt: local(new Date(NOW.getTime() - 3 * HOUR)),
        endsAt: local(new Date(NOW.getTime() - HOUR)),
      }),
    );
    await manage.create(
      eventInput({
        title: "Live",
        startsAt: local(new Date(NOW.getTime() - HOUR)),
        endsAt: local(new Date(NOW.getTime() + HOUR)),
      }),
    );
    await manage.create(
      eventInput({
        title: "Later",
        startsAt: local(new Date(NOW.getTime() + HOUR)),
        endsAt: local(new Date(NOW.getTime() + 3 * HOUR)),
      }),
    );

    const { entries } = await manage.getPublicTimetable({ limit: 50 });

    expect(entries.map((entry) => [entry.title, entry.scheduleStatus])).toEqual([
      ["Finished", "ended"],
      ["Live", "ongoing"],
      ["Later", "upcoming"],
    ]);
  });

  it("orders chronologically with a deterministic tie-break", async () => {
    const manage = new ManageEvents(db, clock);

    await manage.create(
      eventInput({ title: "Later", startsAt: local(new Date(NOW.getTime() + 5 * HOUR)), endsAt: local(new Date(NOW.getTime() + 6 * HOUR)) }),
    );
    await manage.create(
      eventInput({ title: "Earlier", startsAt: local(new Date(NOW.getTime() + HOUR)), endsAt: local(new Date(NOW.getTime() + 2 * HOUR)) }),
    );
    // Two events sharing a start time.
    await manage.create(
      eventInput({ title: "Same time A", startsAt: local(new Date(NOW.getTime() + 3 * HOUR)), endsAt: local(new Date(NOW.getTime() + 4 * HOUR)) }),
    );
    await manage.create(
      eventInput({ title: "Same time B", startsAt: local(new Date(NOW.getTime() + 3 * HOUR)), endsAt: local(new Date(NOW.getTime() + 4 * HOUR)) }),
    );

    const first = await manage.getPublicTimetable({ limit: 50 });
    const second = await manage.getPublicTimetable({ limit: 50 });

    // "Earlier" leads and "Later" trails; the two events sharing a start time
    // sit between them in some order fixed by their id.
    const titles = first.entries.map((entry) => entry.title);

    expect(titles[0]).toBe("Earlier");
    expect(titles[titles.length - 1]).toBe("Later");
    expect(titles.slice(1, 3).sort()).toEqual(["Same time A", "Same time B"]);

    // Stable across renders: no key churn or layout shift between requests.
    expect(second.entries.map((entry) => entry.id)).toEqual(
      first.entries.map((entry) => entry.id),
    );
  });

  it("paginates without gaps or repeats", async () => {
    const manage = new ManageEvents(db, clock);

    for (let index = 0; index < 5; index += 1) {
      await manage.create(
        eventInput({
          title: `Event ${index}`,
          startsAt: local(new Date(NOW.getTime() + (index + 1) * HOUR)),
          endsAt: local(new Date(NOW.getTime() + (index + 2) * HOUR)),
        }),
      );
    }

    const pageOne = await manage.getPublicTimetable({ limit: 2, offset: 0 });
    const pageTwo = await manage.getPublicTimetable({ limit: 2, offset: 2 });
    const pageThree = await manage.getPublicTimetable({ limit: 2, offset: 4 });

    expect(pageOne.total).toBe(5);
    expect(pageOne.entries).toHaveLength(2);
    expect(pageTwo.entries).toHaveLength(2);
    expect(pageThree.entries).toHaveLength(1);

    const ids = [
      ...pageOne.entries,
      ...pageTwo.entries,
      ...pageThree.entries,
    ].map((entry) => entry.id);

    expect(new Set(ids).size).toBe(5);
  });
});

describe("public event detail", () => {
  it("returns null for an unpublished event", async () => {
    const manage = new ManageEvents(db, clock);

    const draft = await manage.create(
      eventInput({ publicationStatus: "draft" }),
    );

    expect(await manage.getPublicEvent(draft.public_id)).toBeNull();

    await manage.setPublicationStatus(draft.id, "published");
    expect(await manage.getPublicEvent(draft.public_id)).not.toBeNull();

    await manage.setPublicationStatus(draft.id, "archived");
    expect(await manage.getPublicEvent(draft.public_id)).toBeNull();
  });
});

describe("rooms and room timetables", () => {
  it("creates rooms, assigns events, and filters public schedules by room", async () => {
    const manage = new ManageEvents(db, clock);
    const mainHall = await manage.createRoom({
      name: "Main Hall",
      description: "Ground floor",
    });
    const studio = await manage.createRoom({ name: "Studio B" });
    await manage.createRoom({ name: "Unused room" });

    const mainEvent = await manage.create(
      eventInput({ title: "Opening", roomPublicId: mainHall.publicId }),
    );
    await manage.create(
      eventInput({ title: "Workshop", roomPublicId: studio.publicId }),
    );
    await manage.create(
      eventInput({ title: "Private draft", roomPublicId: mainHall.publicId, publicationStatus: "draft" }),
    );

    const mainSchedule = await manage.getPublicTimetable({
      limit: 20,
      roomPublicId: mainHall.publicId,
    });
    expect(mainSchedule.total).toBe(1);
    expect(mainSchedule.entries.map((entry) => entry.title)).toEqual(["Opening"]);
    expect(mainSchedule.entries[0]?.room_name).toBe("Main Hall");

    expect((await manage.listPublicRooms()).map((room) => room.name)).toEqual([
      "Main Hall",
      "Studio B",
    ]);
    expect((await manage.listRoomsForAdmin()).map((room) => room.name)).toEqual([
      "Main Hall",
      "Studio B",
      "Unused room",
    ]);
    expect((await manage.getPublicEvent(mainEvent.public_id))?.room_name).toBe("Main Hall");
  });

  it("rejects unknown room assignments and case-insensitive duplicate room names", async () => {
    const manage = new ManageEvents(db, clock);
    await manage.createRoom({ name: "Main Hall" });

    await expect(manage.createRoom({ name: "main hall" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      manage.create(eventInput({ roomPublicId: "not-a-room" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates a room without breaking its existing timetable assignment", async () => {
    const manage = new ManageEvents(db, clock);
    const room = await manage.createRoom({ name: "Studio A" });
    const event = await manage.create(
      eventInput({ roomPublicId: room.publicId }),
    );

    await manage.updateRoom(room.publicId, {
      name: "Studio East",
      description: "Upper floor",
    });

    expect((await manage.getPublicEvent(event.public_id))?.room_name).toBe("Studio East");
    expect(
      (await manage.getPublicTimetable({ limit: 20, roomPublicId: room.publicId })).total,
    ).toBe(1);
  });
});

describe("database constraints", () => {
  it("keeps room names case-insensitively unique at the database boundary", async () => {
    await db
      .insertInto("rooms")
      .values({ public_id: "abcdefgh12345678", name: "Main Hall" })
      .execute();

    await expect(
      db
        .insertInto("rooms")
        .values({ public_id: "ijklmnop12345678", name: " MAIN HALL " })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects an event whose end is not after its start, even via raw SQL", async () => {
    await expect(
      db
        .insertInto("events")
        .values({
          public_id: "abcdefgh12345678",
          title: "Bad",
          starts_at: new Date(NOW.toISOString()),
          ends_at: new Date(NOW.toISOString()),
          timezone: "UTC",
          publication_status: "published",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects an unknown publication status", async () => {
    await expect(
      db
        .insertInto("events")
        .values({
          public_id: "zzzzzzzz12345678",
          title: "Bad",
          starts_at: new Date(NOW.toISOString()),
          ends_at: new Date(NOW.getTime() + HOUR),
          timezone: "UTC",
          publication_status: "sideways" as never,
        })
        .execute(),
    ).rejects.toThrow();
  });
});

describe("events are independent of quizzes", () => {
  it("publishing and unpublishing an event touches no quiz tables", async () => {
    const manage = new ManageEvents(db, clock);

    const event = await manage.create(eventInput({ publicationStatus: "draft" }));

    const before = {
      quizzes: await db.selectFrom("quizzes").selectAll().execute(),
      attempts: await db.selectFrom("quiz_attempts").selectAll().execute(),
      certificates: await db.selectFrom("certificates").selectAll().execute(),
    };

    await manage.setPublicationStatus(event.id, "published");
    await manage.setPublicationStatus(event.id, "archived");

    expect(await db.selectFrom("quizzes").selectAll().execute()).toHaveLength(
      before.quizzes.length,
    );
    expect(await db.selectFrom("quiz_attempts").selectAll().execute()).toHaveLength(
      before.attempts.length,
    );
    expect(await db.selectFrom("certificates").selectAll().execute()).toHaveLength(
      before.certificates.length,
    );
  });
});

describe("ManageEvents", () => {
  it("updates an existing event", async () => {
    const manage = new ManageEvents(db, clock);

    const event = await manage.create(eventInput());
    const room = await manage.createRoom({ name: "Studio B" });

    await manage.update(
      event.id,
      eventInput({
        title: "Renamed",
        location: "East wing",
        roomPublicId: room.publicId,
      }),
    );

    const reloaded = await manage.getForAdmin(event.id);
    expect(reloaded.title).toBe("Renamed");
    expect(reloaded.location).toBe("East wing");
    expect(reloaded.room_name).toBe("Studio B");
  });

  it("lists unpublished events for administrators", async () => {
    const manage = new ManageEvents(db, clock);

    await manage.create(eventInput({ publicationStatus: "draft" }));
    await manage.create(eventInput({ publicationStatus: "published" }));

    const { rows, total } = await manage.listForAdmin({ limit: 50, offset: 0 });

    expect(total).toBe(2);
    expect(rows.map((row) => row.title).sort()).toEqual([
      "Opening Ceremony",
      "Opening Ceremony",
    ]);
  });
});
