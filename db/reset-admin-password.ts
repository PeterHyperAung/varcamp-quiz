/**
 * Resets an existing administrator password from a trusted local terminal.
 *
 * The new password is prompted without terminal echo and is never passed as a
 * command-line argument, logged, or stored as plaintext.
 *
 * Usage: `pnpm db:reset-admin-password`
 */
import { loadEnvConfig } from "@next/env";
import { createInterface } from "node:readline/promises";
import { z } from "zod";

import { resetServerEnvCache } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { AdministratorRepository } from "@/modules/admin-auth/infrastructure/administrator-repository";
import { hashPassword } from "@/modules/admin-auth/infrastructure/password-hasher";

const MIN_PASSWORD_CHARACTERS = 12;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

class ResetCommandError extends Error {}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ResetCommandError(
      "Run this command in an interactive terminal so the new password can be entered without echo.",
    );
  }

  loadEnvConfig(process.cwd());
  resetServerEnvCache();

  const email = await promptEmail();
  const parsedEmail = z.email().safeParse(email);
  if (!parsedEmail.success) {
    throw new ResetCommandError("Enter a valid administrator email address.");
  }

  const password = await readHidden("New password (hidden): ");
  const confirmation = await readHidden("Confirm new password: ");

  if (password !== confirmation) {
    throw new ResetCommandError("The passwords do not match. No changes were made.");
  }

  const characterCount = Array.from(password).length;
  if (characterCount < MIN_PASSWORD_CHARACTERS) {
    throw new ResetCommandError(
      `Use at least ${MIN_PASSWORD_CHARACTERS} characters. No changes were made.`,
    );
  }

  if (Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
    throw new ResetCommandError(
      `Use at most ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes. No changes were made.`,
    );
  }

  const db = getDb();

  try {
    const administrators = new AdministratorRepository(db);
    const administrator = await administrators.findByEmail(parsedEmail.data);

    if (!administrator) {
      throw new ResetCommandError("No administrator account matches that email.");
    }

    const passwordHash = await hashPassword(password);
    await administrators.updatePasswordHash(administrator.id, passwordHash);

    console.log("Administrator password updated.");
    console.log("Existing sign-in sessions remain valid for up to 8 hours.");
  } finally {
    await db.destroy();
  }
}

async function promptEmail(): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return (await readline.question("Administrator email: ")).trim();
  } finally {
    readline.close();
  }
}

function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  const wasRaw = input.isRaw;

  return new Promise((resolve, reject) => {
    let value = "";
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      input.off("data", onData);
      input.off("end", onEnd);
      input.setRawMode(wasRaw ?? false);
      input.pause();
    };

    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003" || character === "\u0004") {
          cleanup();
          output.write("\n");
          reject(new ResetCommandError("Password reset cancelled. No changes were made."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }

        if (character >= " ") value += character;
      }
    };

    const onEnd = () => {
      cleanup();
      output.write("\n");
      reject(new ResetCommandError("Input ended. No changes were made."));
    };

    output.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.on("data", onData);
    input.once("end", onEnd);
    input.resume();
  });
}

main().catch((error: unknown) => {
  if (error instanceof ResetCommandError) {
    console.error(error.message);
  } else {
    // Avoid printing driver/configuration details that could contain secrets.
    console.error("Password reset failed. Check the configured database connection and try again.");
  }

  process.exitCode = 1;
});
