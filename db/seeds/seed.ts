/**
 * Development seed.
 *
 * Creates a first administrator (from `ADMIN_BOOTSTRAP_*`), a published quiz
 * with a few questions, and a couple of events at different points on the
 * timeline so the timetable's upcoming/ongoing/ended states are all visible.
 *
 * Usage: `pnpm db:seed`
 */
import { Kysely } from "kysely";
import { loadEnvConfig } from "@next/env";

import { hashPassword } from "@/modules/admin-auth/infrastructure/password-hasher";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import { getDb } from "@/lib/db/client";
import { resetServerEnvCache } from "@/lib/config/env";
import { migrateToLatest } from "@/lib/db/migrate";
import { formatForEventInput } from "@/lib/validation/events";
import type { Database } from "@/lib/db/types";

const HOUR = 60 * 60 * 1000;

async function bootstrapAdministrator(db: Kysely<Database>): Promise<string> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD (12+ characters) before seeding.",
    );
  }

  const existing = await db
    .selectFrom("administrators")
    .select("id")
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
    .executeTakeFirst();

  if (existing) {
    console.log(`Administrator ${email} already exists.`);
    return existing.id;
  }

  const administrator = await db
    .insertInto("administrators")
    .values({
      email,
      name: "VarCamp Organiser",
      password_hash: await hashPassword(password),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  console.log(`Created administrator ${email}.`);
  return administrator.id;
}

async function seedQuiz(db: Kysely<Database>, administratorId: string): Promise<void> {
  const manage = new ManageQuizzes(db);

  const existing = await db
    .selectFrom("quizzes")
    .select("id")
    .where("title", "=", "VarCamp Welcome Quiz")
    .executeTakeFirst();

  if (existing) {
    console.log("Welcome quiz already exists.");
    return;
  }

  const quiz = await manage.create(
    {
      title: "VarCamp Welcome Quiz",
      description: "A short warm-up quiz to get you ready for camp.",
    },
    administratorId,
  );

  await manage.updateSettings(quiz.id, {
    instructions: "Answer every question, then submit once. You will see your result right away.",
    passingScore: 60,
    certificateEnabled: "true",
  });

  await manage.addQuestion(quiz.id, {
    prompt: "What does the VarCamp flame logo represent?",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A campfire", isCorrect: false },
      { label: "The camp spirit", isCorrect: true },
      { label: "A torch", isCorrect: false },
      { label: "A lantern", isCorrect: false },
    ],
  });

  await manage.addQuestion(quiz.id, {
    prompt: "Participants need an account to take a quiz.",
    questionType: "true_false",
    points: 1,
    options: [
      { label: "True", isCorrect: false },
      { label: "False", isCorrect: true },
    ],
  });

  await manage.addQuestion(quiz.id, {
    prompt: "How many colour accents appear in the VarCamp palette?",
    questionType: "multiple_choice",
    points: 2,
    options: [
      { label: "Three", isCorrect: false },
      { label: "Four — crimson, sun yellow, electric blue and magenta", isCorrect: true },
      { label: "Six", isCorrect: false },
    ],
  });

  await manage.publish(quiz.id);

  console.log(`Published quiz /quizzes/${quiz.public_id}`);
}

async function seedEvents(db: Kysely<Database>): Promise<void> {
  const manage = new ManageEvents(db);
  const now = Date.now();

  const count = await db
    .selectFrom("events")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirst();

  if (Number(count?.count ?? 0) > 0) {
    console.log("Events already exist.");
    return;
  }

  const timezone = process.env.DISPLAY_TIMEZONE ?? "Asia/Yangon";

  // Times are submitted as wall-clock strings in the event's own timezone,
  // exactly as the admin form does; the use case converts them to instants.
  const local = (instant: Date) => formatForEventInput(instant, timezone);

  await manage.create({
    title: "Opening Ceremony",
    description: "Welcome to VarCamp 2026.",
    location: "Main Hall",
    startsAt: local(new Date(now - 2 * HOUR)),
    endsAt: local(new Date(now - 1 * HOUR)),
    timezone,
    publicationStatus: "published",
  });

  await manage.create({
    title: "Team Building Workshop",
    description: "Split into teams and work through the design challenge.",
    location: "Studio B",
    startsAt: local(new Date(now - 30 * 60 * 1000)),
    endsAt: local(new Date(now + 90 * 60 * 1000)),
    timezone,
    publicationStatus: "published",
  });

  await manage.create({
    title: "Community Night",
    description: "Food, music and lightning talks.",
    location: "Courtyard",
    startsAt: local(new Date(now + 2 * 24 * HOUR)),
    endsAt: local(new Date(now + 2 * 24 * HOUR + 3 * HOUR)),
    timezone,
    publicationStatus: "published",
  });

  await manage.create({
    title: "Closing Ceremony & Awards",
    description: "Wrap up and celebrate the winners.",
    location: "Main Hall",
    startsAt: local(new Date(now + 4 * 24 * HOUR)),
    endsAt: local(new Date(now + 4 * 24 * HOUR + 2 * HOUR)),
    timezone,
    publicationStatus: "draft",
  });

  console.log("Seeded four events (one left as a draft).");
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  resetServerEnvCache();
  await migrateToLatest(getDb());

  const db = getDb();
  const administratorId = await bootstrapAdministrator(db);

  await seedQuiz(db, administratorId);
  await seedEvents(db);

  console.log("Seed complete.");
  await db.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
