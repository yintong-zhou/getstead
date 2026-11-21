import { emitKeypressEvents, type Key } from "node:readline";
import { createInterface } from "node:readline/promises";
import { localPostgresUrl } from "./config.ts";
import { disconnectDb } from "./database.ts";
import { createOwner, promoteOwner, resetOwner } from "./owner.ts";

function askHidden(prompt: string) {
  const input = process.stdin;
  process.stdout.write(prompt);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    function onKey(character: string | undefined, key: Key) {
      if (key.name === "return" || key.name === "enter" || (key.ctrl && key.name === "c")) {
        input.off("keypress", onKey);
        input.setRawMode(false);
        input.pause();
        process.stdout.write("\n");
        if (key.ctrl) reject(new Error("Cancelled."));
        else resolve(value);
      } else if (key.name === "backspace") {
        value = [...value].slice(0, -1).join("");
      } else if (character && !key.ctrl && !key.meta && !/\p{Cc}/u.test(character)) {
        value += character;
      }
    }

    input.on("keypress", onKey);
  });
}

async function main() {
  const action = process.argv[2];
  if ((action !== "create" && action !== "reset" && action !== "promote") || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run auth:owner with create, reset or promote in an interactive terminal.");
  }

  process.env.DATABASE_URL = localPostgresUrl(process.env.DATABASE_ADMIN_URL).href;

  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  const email = await prompts.question("getstead account email: ").finally(() => prompts.close());
  if (action === "promote") {
    if (!await promoteOwner(email)) throw new Error("Owner account not found.");
    console.log("Account promoted to admin. The admin area requires two-step verification.");
    return;
  }
  const password = await askHidden("getstead password: ");
  const confirmation = await askHidden("Confirm getstead password: ");
  if (password !== confirmation) throw new Error("Passwords must match.");

  if (action === "create") {
    await createOwner(email, password);
    console.log("Owner account created. Set up two-step verification at the next sign-in.");
  } else if (await resetOwner(email, password)) {
    console.log("Owner account reset. Set up two-step verification at the next sign-in.");
  } else {
    throw new Error("Owner account not found.");
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof Error && "code" in error) {
    console.error("PostgreSQL could not complete the owner command:", error.code);
  } else {
    console.error(error instanceof Error ? error.message : "Owner command failed.");
  }
  process.exitCode = 1;
} finally {
  await disconnectDb().catch(() => { process.exitCode = 1; });
}
