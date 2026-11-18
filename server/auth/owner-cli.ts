import { emitKeypressEvents, type Key } from "node:readline";
import { createInterface } from "node:readline/promises";
import { closePool } from "./database.ts";
import { createOwner, resetOwner } from "./owner.ts";

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
  if ((action !== "create" && action !== "reset") || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run auth:owner with create or reset in an interactive terminal.");
  }

  const connect = process.env.ORACLE_CONNECT_STRING ?? "";
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/XEPDB1$/i.test(connect)) {
    throw new Error("Owner commands require the local XEPDB1 service.");
  }

  process.env.ORACLE_USER = process.env.ORACLE_ADMIN_USER ?? "stead_auth_owner";
  process.env.ORACLE_PASSWORD = process.env.ORACLE_ADMIN_PASSWORD ?? await askHidden("Oracle schema owner password: ");

  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  const email = await prompts.question("Stead account email: ").finally(() => prompts.close());
  const password = await askHidden("Stead password: ");
  const confirmation = await askHidden("Confirm Stead password: ");
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
    console.error("Oracle could not complete the owner command:", error.code);
  } else {
    console.error(error instanceof Error ? error.message : "Owner command failed.");
  }
  process.exitCode = 1;
} finally {
  await closePool().catch(() => { process.exitCode = 1; });
}
