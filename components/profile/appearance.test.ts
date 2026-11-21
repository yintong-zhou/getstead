import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { glassBootstrap, glassStorageKey } from "./appearance.ts";

test("restores only valid browser transparency preferences before rendering", () => {
  function restore(value: string | null) {
    const dataset: Record<string, string> = {};
    runInNewContext(glassBootstrap, {
      document: { documentElement: { style: { setProperty: (key: string, value: string) => { dataset[key] = value; } } } },
      localStorage: { getItem: (key: string) => key === glassStorageKey ? value : null },
    });
    return dataset["--glass-transparency"];
  }
  assert.equal(restore("0"), "0%");
  assert.equal(restore("42"), "42%");
  assert.equal(restore("100"), "100%");
  assert.equal(restore("101"), undefined);
  assert.equal(restore(""), undefined);
  assert.equal(restore(null), undefined);
});
