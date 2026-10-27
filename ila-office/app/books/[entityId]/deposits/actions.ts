"use server";
import { createMoneyMove, voidMoneyMoveFromPage } from "../money/shared";

export async function createDepositAction(entityId: string, fd: FormData) {
  await createMoneyMove("deposit", entityId, fd);
}

export async function voidDepositAction(entityId: string, paymentId: string) {
  await voidMoneyMoveFromPage("deposit", entityId, paymentId);
}
