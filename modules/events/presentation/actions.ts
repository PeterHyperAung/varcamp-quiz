"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/db/client";
import { failure, toActionState, type ActionState } from "@/lib/forms";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { requireAdminSession } from "@/modules/admin-auth/presentation/session";

/**
 * Administrative event mutations.
 *
 * Events are an independent domain: nothing here touches quizzes, and the
 * events table has no foreign key to them.
 */

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();

  try {
    const manage = new ManageEvents(getDb());
    const event = await manage.create({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      location: String(formData.get("location") ?? ""),
      roomPublicId: String(formData.get("roomPublicId") ?? ""),
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      publicationStatus: String(formData.get("publicationStatus") ?? "draft"),
    });

    revalidatePath("/admin/events");
    revalidatePath("/events");
    revalidatePath("/");
    return { status: "success", message: event.id };
  } catch (error) {
    return toActionState(error, "createEvent");
  }
}

export async function updateEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const eventId = String(formData.get("eventId"));

  try {
    const manage = new ManageEvents(getDb());
    await manage.update(eventId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      location: String(formData.get("location") ?? ""),
      roomPublicId: String(formData.get("roomPublicId") ?? ""),
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      publicationStatus: String(formData.get("publicationStatus") ?? "draft"),
    });

    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath("/admin/events");
    revalidatePath("/events");
    revalidatePath("/");
    return { status: "success", message: "Event saved." };
  } catch (error) {
    return toActionState(error, "updateEvent");
  }
}

export async function createRoomAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();

  try {
    await new ManageEvents(getDb()).createRoom({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });

    revalidateRoomTimetables();
    return { status: "success", message: "Room created." };
  } catch (error) {
    return toActionState(error, "createRoom");
  }
}

export async function updateRoomAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const roomPublicId = String(formData.get("roomPublicId") ?? "");

  try {
    await new ManageEvents(getDb()).updateRoom(roomPublicId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });

    revalidateRoomTimetables();
    return { status: "success", message: "Room saved." };
  } catch (error) {
    return toActionState(error, "updateRoom");
  }
}

export async function setEventPublicationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const eventId = String(formData.get("eventId"));
  const publicationStatus = String(formData.get("publicationStatus"));

  try {
    const manage = new ManageEvents(getDb());

    if (!["draft", "published", "archived"].includes(publicationStatus)) {
      return failure("Unknown publication status.");
    }

    await manage.setPublicationStatus(
      eventId,
      publicationStatus as "draft" | "published" | "archived",
    );

    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath("/admin/events");
    revalidatePath("/events");
    revalidatePath("/");
    return { status: "success", message: `Event is now ${publicationStatus}.` };
  } catch (error) {
    return toActionState(error, "setEventPublication");
  }
}

function revalidateRoomTimetables(): void {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/");
}
