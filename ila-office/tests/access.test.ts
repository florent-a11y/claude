import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedEntityIds, can, canAccessEntity, isClient, scopeByEntity, scopeEntities } from "../lib/access";

const admin = { role: "admin" as const };
const accountant = { role: "accountant" as const };
const consultant = { role: "consultant" as const };
const viewer = { role: "viewer" as const };
const client = { role: "client" as const, entityIds: ["e1", "e2"] };
const clientNoAlloc = { role: "client" as const };

test("team roles see every entity, clients only their allocation", () => {
  for (const u of [admin, accountant, consultant, viewer]) {
    assert.equal(allowedEntityIds(u), null);
    assert.ok(canAccessEntity(u, "anything"));
    assert.equal(isClient(u), false);
  }
  assert.ok(isClient(client));
  assert.ok(canAccessEntity(client, "e1"));
  assert.equal(canAccessEntity(client, "e3"), false);
  assert.equal(canAccessEntity(client, undefined), false);
  assert.equal(canAccessEntity(clientNoAlloc, "e1"), false);
  assert.equal(canAccessEntity(null, "e1"), false);
});

test("permissions: clients and viewers read only, team roles write their modules", () => {
  assert.ok(can(client, "read"));
  for (const perm of ["crm:write", "books:write", "tax:write", "admin"] as const) {
    assert.equal(can(client, perm), false, perm);
    assert.equal(can(viewer, perm), false, perm);
    assert.ok(can(admin, perm), perm);
  }
  assert.ok(can(accountant, "books:write"));
  assert.ok(can(accountant, "tax:write"));
  assert.equal(can(accountant, "crm:write"), false);
  assert.ok(can(consultant, "crm:write"));
  assert.equal(can(consultant, "books:write"), false);
  assert.equal(can(null, "read"), false);
});

test("scoping keeps every row for the team and only allocated rows for a client", () => {
  const entities = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
  assert.equal(scopeEntities(admin, entities).length, 3);
  assert.deepEqual(scopeEntities(client, entities).map((e) => e.id), ["e1", "e2"]);
  const companies = [{ name: "A", entityId: "e1" }, { name: "B", entityId: "e3" }, { name: "C", entityId: undefined }];
  assert.deepEqual(scopeByEntity(client, companies, (c) => c.entityId).map((c) => c.name), ["A"]);
  assert.equal(scopeByEntity(viewer, companies, (c) => c.entityId).length, 3);
  assert.equal(scopeEntities(clientNoAlloc, entities).length, 0);
});
