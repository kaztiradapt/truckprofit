export type DelegablePermissionAccess = {
  isPrimaryOwner: boolean;
  permissions: readonly string[];
};

export function canDelegatePermissions(
  access: DelegablePermissionAccess,
  requestedPermissions: readonly string[] | null | undefined,
): boolean {
  if (access.isPrimaryOwner) return true;
  const ownedPermissions = new Set(access.permissions);
  return (requestedPermissions ?? []).every((permission) => ownedPermissions.has(permission));
}
