import { handle, readOutput } from "@/lib/api/handler";
import { todayBoardSchema, type TodayBoard } from "@/lib/market/movers";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FRESH_MS = 120_000;
const STALE_MS = 30 * 60_000;
let memo: { at: number; board: TodayBoard } | null = null;
let pending: Promise<TodayBoard> | null = null;

function markStale(board: TodayBoard): TodayBoard {
  const rows = (cards: TodayBoard["gainers"]) => cards.map((card) => ({ ...card, stale: true }));
  return { gainers: rows(board.gainers), losers: rows(board.losers), viewed: rows(board.viewed),
    spy: board.spy ? { ...board.spy, stale: true } : null };
}

async function boardNow(): Promise<TodayBoard> {
  const now = Date.now();
  if (memo && now - memo.at < FRESH_MS) return memo.board;
  if (memo && now - memo.at < STALE_MS) {
    if (!pending) void refresh(now).catch(() => undefined);
    return markStale(memo.board);
  }
  return refresh(now);
}

function refresh(now: number): Promise<TodayBoard> {
  if (pending) return pending;
  pending = getServices().market.today(now)
    .then((board) => {
      const hasRows = board.gainers.length + board.losers.length + board.viewed.length > 0 || board.spy !== null;
      if (hasRows) memo = { at: Date.now(), board };
      return board;
    })
    .finally(() => { pending = null; });
  return pending;
}

export function GET(req: Request) {
  return handle("short", async () => {
    const ipLimited = await withRateLimit(req, "prices");
    if (ipLimited) return ipLimited;
    return readOutput(todayBoardSchema, await boardNow());
  });
}
