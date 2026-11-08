import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoginForm } from "@/modules/admin-auth/presentation/login-form";
import { getAdminSession } from "@/modules/admin-auth/presentation/session";

export const metadata = {
  title: "Admin sign in",
};

/** Administrator sign-in. Only administrators ever need an account. */
export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <div className="vc-surface p-7">
        <h1 className="vc-heading text-2xl">Administrator sign in</h1>
        <p className="vc-body-copy mt-2 text-sm">
          Quizzes and events are managed here. Public participants never need to
          sign in.
        </p>

        <div className="mt-6">
          {/* Reads the session cookie to bounce an already-signed-in
              administrator to the dashboard. */}
          <Suspense fallback={<LoginFallback />}>
            <LoginPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">Checking your session…</span>
      <div className="vc-field h-11 animate-pulse" />
      <div className="vc-field h-11 animate-pulse" />
      <div className="vc-pill-cta w-full animate-pulse">Sign in</div>
    </div>
  );
}

async function LoginPanel() {
  await connection();

  if (await getAdminSession()) {
    redirect("/admin");
  }

  return (
    <LoginForm />
  );
}