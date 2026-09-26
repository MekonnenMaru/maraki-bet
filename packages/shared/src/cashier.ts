import type { BetReceiptDto } from "./betting";

export type CashierDeskDto = {
  saleId: string;
  label: string;
  shopId: string;
  shopName: string;
  agentName?: string | null;
};

export type CashierSessionDto = {
  user: {
    id: string;
    username: string;
    phone: string | null;
    role: "CASHIER";
  };
  wallet: {
    currency: string;
    available: string;
    locked: string;
  };
  desk: CashierDeskDto;
};

export type CashierDashboardDto = {
  currency: string;
  from: string;
  to: string;
  desk: CashierDeskDto;
  today: {
    ticketsPlaced: number;
    cashTaken: string;
    openTickets: number;
    pendingPayout: string;
    pendingPayoutCount: number;
  };
  recent: BetReceiptDto[];
};

export type CashierBetListDto = {
  items: BetReceiptDto[];
  total: number;
};
