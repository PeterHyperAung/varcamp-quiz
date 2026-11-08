"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "@/modules/admin-auth/presentation/actions";
import { idleState } from "@/lib/forms";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, idleState);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="vc-field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="vc-field"
        />
      </div>

      <div>
        <label className="vc-field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="vc-field"
        />
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="vc-error-text">
          {state.message}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}