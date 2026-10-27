import { MoneyMoveNewPage } from "../../money/MoneyMoveNew";
import type { Params, Search } from "../../shared";
import { createDepositAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDeposit(props: { params: Params; searchParams: Search }) {
  return <MoneyMoveNewPage kind="deposit" action={createDepositAction} {...props} />;
}
