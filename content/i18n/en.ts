import type { Messages } from "@/content/i18n/es-CL";

export const en = {
  nav: {
    label: "Sections",
    market: "Market",
    portfolio: "Portfolio",
    wallet: "Wallet",
    profile: "Profile",
  },
  shell: {
    balance: "Balance",
    hideBalance: "Hide balance",
    showBalance: "Show balance",
    balanceHidden: "Balance hidden",
    balanceUnavailable: "Balance unavailable",
    account: "Go to your profile",
    skip: "Skip to content",
  },
  disclaimer: "Tokenized stocks do not grant shareholder rights. Investing involves risks.",
  pages: {
    market: {
      title: "Market",
      lead: "Tokenized U.S. stocks.",
      emptyTitle: "The list is not on this screen yet",
    },
    portfolio: {
      title: "Portfolio",
      lead: "The value of your stocks.",
      emptyTitle: "Your positions are not on this screen yet",
    },
    wallet: {
      title: "Wallet",
      lead: "What you have available to buy.",
      emptyTitle: "Your wallet is not on this screen yet",
    },
    profile: {
      title: "Profile",
      lead: "Your account and preferences.",
      emptyTitle: "Your settings are not on this screen yet",
    },
  },
  states: {
    loading: "Loading",
    retry: "Try again",
    error: "Error",
    unavailable: "This section is not available yet.",
  },
} satisfies Messages;
