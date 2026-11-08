"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/forms";
import type { EventRow } from "@/lib/db/types";
import { formatForEventInput } from "@/lib/validation/events";
import type { RoomView } from "@/modules/events/application/manage-events";
import {
  createEventAction,
  updateEventAction,
} from "@/modules/events/presentation/actions";

interface EventFormProps {
  event?: Pick<
    EventRow,
    | "id"
    | "title"
    | "description"
    | "location"
    | "starts_at"
    | "ends_at"
    | "timezone"
    | "publication_status"
  > & { room_public_id: string | null };
  rooms: RoomView[];
  defaultTimezone: string;
  timezones: string[];
}

/**
 * Event editor.
 *
 * Start/end are collected as wall-clock times in the event's own timezone; the
 * server converts them to absolute instants, so the browser and server
 * timezones never affect what gets stored.
 */
export function EventForm({ event, rooms, defaultTimezone, timezones }: EventFormProps) {
  const action = event ? updateEventAction : createEventAction;
  const [state, formAction] = useActionState(action, idleState);

  const timezone = event?.timezone ?? defaultTimezone;

  return (
    <form action={formAction} className="space-y-5">
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}

      <div>
        <label className="vc-field-label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={event?.title}
          required
          maxLength={200}
          className="vc-field"
        />
        {state.fieldErrors?.title ? (
          <p className="vc-error-text">{state.fieldErrors.title[0]}</p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={event?.description ?? ""}
          rows={4}
          maxLength={2000}
          className="vc-field"
        />
        {state.fieldErrors?.description ? (
          <p className="vc-error-text">{state.fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor="roomPublicId">
          Room
        </label>
        <select
          id="roomPublicId"
          name="roomPublicId"
          defaultValue={event?.room_public_id ?? ""}
          className="vc-field"
        >
          <option value="">No room assigned</option>
          {rooms.map((room) => (
            <option key={room.publicId} value={room.publicId}>
              {room.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.roomPublicId ? (
          <p className="vc-error-text">{state.fieldErrors.roomPublicId[0]}</p>
        ) : null}
        {rooms.length === 0 ? (
          <p className="vc-field-hint">
            Create a room below before assigning events to a room.
          </p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor="location">
          Location details
        </label>
        <input
          id="location"
          name="location"
          defaultValue={event?.location ?? ""}
          maxLength={300}
          className="vc-field"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="vc-field-label" htmlFor="startsAt">
            Starts at
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={
              event ? formatForEventInput(event.starts_at, event.timezone) : ""
            }
            required
            className="vc-field"
          />
          {state.fieldErrors?.startsAt ? (
            <p className="vc-error-text">{state.fieldErrors.startsAt[0]}</p>
          ) : null}
        </div>

        <div>
          <label className="vc-field-label" htmlFor="endsAt">
            Ends at
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={event ? formatForEventInput(event.ends_at, event.timezone) : ""}
            required
            className="vc-field"
          />
          {state.fieldErrors?.endsAt ? (
            <p className="vc-error-text">{state.fieldErrors.endsAt[0]}</p>
          ) : null}
        </div>

        <div>
          <label className="vc-field-label" htmlFor="timezone">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            className="vc-field"
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          {state.fieldErrors?.timezone ? (
            <p className="vc-error-text">{state.fieldErrors.timezone[0]}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="vc-field-label" htmlFor="publicationStatus">
          Visibility
        </label>
        <select
          id="publicationStatus"
          name="publicationStatus"
          defaultValue={event?.publication_status ?? "draft"}
          className="vc-field"
        >
          <option value="draft">Draft — hidden from the public timetable</option>
          <option value="published">Published — visible on the timetable</option>
          <option value="archived">Archived — hidden, kept for records</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Saving…">
          {event ? "Save event" : "Create event"}
        </SubmitButton>
        {state.status !== "idle" && state.message ? (
          <p
            role="status"
            className={state.status === "error" ? "vc-error-text" : "text-sm text-sun-500"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
