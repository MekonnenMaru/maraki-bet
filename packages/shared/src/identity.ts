export type UserRole = "PLAYER" | "AGENT" | "CASHIER" | "ADMIN";

export type UserDto = {
  id: string;
  username: string;
  phone: string | null;
  role: UserRole;
};

export type WalletDto = {
  currency: string;
  available: string;
  locked: string;
};

export type SessionDto = {
  user: UserDto;
  wallet: WalletDto;
};

export type LedgerEntryDto = {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
};
