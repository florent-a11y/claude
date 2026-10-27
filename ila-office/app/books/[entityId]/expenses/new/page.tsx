import { MoneyMoveNewPage } from "../../money/MoneyMoveNew";
import type { Params, Search } from "../../shared";
import { createExpenseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewExpense(props: { params: Params; searchParams: Search }) {
  return <MoneyMoveNewPage kind="expense" action={createExpenseAction} {...props} />;
}
