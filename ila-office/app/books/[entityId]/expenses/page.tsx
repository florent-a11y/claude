import { MoneyMoveListPage } from "../money/MoneyMoveList";
import type { Params, Search } from "../shared";

export const dynamic = "force-dynamic";

export default async function Expenses(props: { params: Params; searchParams: Search }) {
  return <MoneyMoveListPage kind="expense" {...props} />;
}
