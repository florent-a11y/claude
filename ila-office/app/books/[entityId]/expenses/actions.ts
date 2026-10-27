"use server";
import { createMoneyMove, voidMoneyMoveFromPage } from "../money/shared";

export async function createExpenseAction(entityId: string, fd: FormData) {
  await createMoneyMove("expense", entityId, fd);
}

export async function voidExpenseAction(entityId: string, paymentId: string) {
  await voidMoneyMoveFromPage("expense", entityId, paymentId);
}
