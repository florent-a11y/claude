import { MoneyMoveDetailPage } from "../../money/MoneyMoveDetail";
import type { Search } from "../../shared";
import { voidExpenseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExpensePage(props: { params: Promise<{ entityId: string; paymentId: string }>; searchParams: Search }) {
  return <MoneyMoveDetailPage kind="expense" voidAction={voidExpenseAction} {...props} />;
}
