import { MoneyMoveDetailPage } from "../../money/MoneyMoveDetail";
import type { Search } from "../../shared";
import { voidDepositAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DepositPage(props: { params: Promise<{ entityId: string; paymentId: string }>; searchParams: Search }) {
  return <MoneyMoveDetailPage kind="deposit" voidAction={voidDepositAction} {...props} />;
}
