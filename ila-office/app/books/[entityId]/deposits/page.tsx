import { MoneyMoveListPage } from "../money/MoneyMoveList";
import type { Params, Search } from "../shared";

export const dynamic = "force-dynamic";

export default async function Deposits(props: { params: Params; searchParams: Search }) {
  return <MoneyMoveListPage kind="deposit" {...props} />;
}
