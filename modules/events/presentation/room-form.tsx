"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/forms";
import type { RoomView } from "@/modules/events/application/manage-events";
import {
  createRoomAction,
  updateRoomAction,
} from "@/modules/events/presentation/actions";

export function RoomForm({ room }: { room?: RoomView }) {
  const action = room ? updateRoomAction : createRoomAction;
  const [state, formAction] = useActionState(action, idleState);
  const suffix = room?.publicId ?? "new";

  return (
    <form action={formAction} className="space-y-4">
      {room ? (
        <input type="hidden" name="roomPublicId" value={room.publicId} />
      ) : null}

      <div>
        <label className="vc-field-label" htmlFor={`room-name-${suffix}`}>
          {room ? "Room name" : "New room name"}
        </label>
        <input
          id={`room-name-${suffix}`}
          name="name"
          defaultValue={room?.name ?? ""}
          required
          maxLength={100}
          className="vc-field"
          placeholder="Main Hall"
        />
        {state.fieldErrors?.name ? (
          <p className="vc-error-text">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor={`room-description-${suffix}`}>
          Description <span className="font-normal text-lavender-500">(optional)</span>
        </label>
        <textarea
          id={`room-description-${suffix}`}
          name="description"
          defaultValue={room?.description ?? ""}
          rows={2}
          maxLength={500}
          className="vc-field"
          placeholder="Floor, building, or access details"
        />
        {state.fieldErrors?.description ? (
          <p className="vc-error-text">{state.fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={room ? "Saving…" : "Creating…"}>
          {room ? "Save room" : "Create room"}
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
