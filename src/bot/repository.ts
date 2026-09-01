export type DriverIdentity = {
  organizationId: string;
  driverId: string;
  driverName: string;
  baseCurrency: string;
};

export type OwnerIdentity = {
  organizationId: string;
  profileId: string;
  ownerName: string;
  organizationName: string;
  baseCurrency: string;
};

export type StaffIdentity = {
  organizationId: string;
  staffId: string;
  staffName: string;
  organizationName: string;
  roleName: string;
};

export type OwnerSummary = {
  vehicleCount: number;
  driverCount: number;
  activeTripCount: number;
  pendingExpenseCount: number;
  pendingExpenseMinor: number;
  overdueIncomeCount: number;
  revenueMinor: number;
  expensesMinor: number;
  profitMinor: number;
};

export type OwnerTripSummary = {
  id: string;
  title: string;
  vehicleName: string;
  driverName: string | null;
  startedAt: string | null;
};

export type OwnerDriverSummary = {
  id: string;
  displayName: string;
  status: string;
  telegramLinked: boolean;
};

export type OwnerExpenseSummary = {
  id: string;
  categoryName: string;
  tripTitle: string | null;
  driverName: string | null;
  amountMinor: number;
  currency: string;
  occurredAt: string;
};

export type ActiveTrip = {
  id: string;
  organizationId: string;
  driverId: string;
  vehicleId: string;
  title: string;
  currency: string;
};

export type RecordExpenseInput = {
  organizationId: string;
  driverId: string;
  tripId: string;
  categoryCode: string;
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  odometerKm?: number;
  fuelLitres?: number;
};

export type RecordStatusInput = {
  organizationId: string;
  driverId: string;
  tripId: string;
  statusCode: "AT_LOADING" | "LOADED" | "IN_TRANSIT" | "AT_UNLOADING" | "UNLOADED" | "IDLE" | "DELAY";
  loadState: "LOADED" | "EMPTY" | "UNKNOWN";
  locationText: string;
  occurredAt: Date;
};

export type PreliminaryCompensation = {
  amountMinor: number;
  currency: string;
  status: "PRELIMINARY" | "APPROVED";
};

export type ReceiptUpload = {
  expenseId: string;
  organizationId: string;
  driverId: string;
  content: ArrayBuffer;
  contentType: "image/jpeg" | "image/png";
  originalFilename: string;
};

export interface DriverBotRepository {
  loadConversation(conversationKey: string): Promise<object | undefined>;
  saveConversation(conversationKey: string, state: object): Promise<void>;
  deleteConversation(conversationKey: string): Promise<void>;
  reserveIncomingUpdate(updateId: number): Promise<boolean>;
  finishIncomingUpdate(updateId: number, outcome: "PROCESSED" | "FAILED", safeErrorSummary?: string): Promise<void>;
  claimInvitation(invitationCode: string, telegramUserId: number): Promise<DriverIdentity>;
  claimOwnerInvitation(invitationCode: string, telegramUserId: number): Promise<OwnerIdentity>;
  claimStaffInvitation(invitationCode: string, telegramUserId: number, telegramUsername: string | null): Promise<StaffIdentity>;
  syncTelegramUsername(telegramUserId: number, telegramUsername: string | null): Promise<void>;
  findDriverByTelegramUserId(telegramUserId: number): Promise<DriverIdentity | null>;
  findOwnerByTelegramUserId(telegramUserId: number): Promise<OwnerIdentity | null>;
  findStaffByTelegramUserId(telegramUserId: number): Promise<StaffIdentity | null>;
  getOwnerSummary(owner: OwnerIdentity): Promise<OwnerSummary>;
  listOwnerActiveTrips(owner: OwnerIdentity): Promise<OwnerTripSummary[]>;
  listOwnerDrivers(owner: OwnerIdentity): Promise<OwnerDriverSummary[]>;
  listOwnerPendingExpenses(owner: OwnerIdentity): Promise<OwnerExpenseSummary[]>;
  findActiveTrip(driver: DriverIdentity): Promise<ActiveTrip | null>;
  recordExpense(input: RecordExpenseInput): Promise<{ expenseId: string }>;
  recordOdometer(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm" | "occurredAt">): Promise<void>;
  startAssignedLeg(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm"> & { loadState: "LOADED" | "EMPTY" }): Promise<void>;
  finishAssignedLeg(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm">): Promise<void>;
  recordStatus(input: RecordStatusInput): Promise<void>;
  findPreliminaryCompensation(driver: DriverIdentity, tripId: string): Promise<PreliminaryCompensation | null>;
  uploadReceipt(upload: ReceiptUpload): Promise<void>;
}
