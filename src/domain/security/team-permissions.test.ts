import { describe, expect, it } from "vitest";

import { canDelegatePermissions, type DelegablePermissionAccess } from "./team-permissions";

const delegatedAccess: DelegablePermissionAccess = {
  isPrimaryOwner: false,
  permissions: ["VIEW_DASHBOARD", "MANAGE_TRIPS", "MANAGE_TEAM"],
};

describe("team permission delegation", () => {
  it("allows a delegated administrator to grant only owned permissions", () => {
    expect(canDelegatePermissions(delegatedAccess, ["VIEW_DASHBOARD", "MANAGE_TRIPS"])).toBe(true);
  });

  it("blocks privilege escalation through a stronger role", () => {
    expect(canDelegatePermissions(delegatedAccess, ["VIEW_DASHBOARD", "DELETE_RECORDS"])).toBe(false);
  });

  it("lets the primary owner manage any valid role", () => {
    expect(canDelegatePermissions({ ...delegatedAccess, isPrimaryOwner: true }, ["DELETE_RECORDS"])).toBe(true);
  });
});
