"use client";

import { useEffect, useTransition } from "react";
import { Thread } from "./Thread";
import { markConversationRead, sendDirectMessage } from "@/lib/actions/dm";
import type { DirectMessageWithMeta } from "@/lib/types";

export function DirectThread({ conversationId, initial, meId, firstName }: { conversationId: string; initial: DirectMessageWithMeta[]; meId: string; firstName: string }) {
  const [, start] = useTransition();
  const markRead = () => start(async () => { await markConversationRead(conversationId); });
  useEffect(() => {
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
  return (
    <Thread
      initial={initial}
      meId={meId}
      pollUrl={`/api/messages/${conversationId}`}
      send={(fd) => sendDirectMessage(conversationId, fd)}
      placeholder={`Message ${firstName}… (Enter to send)`}
      emptyText="No messages yet. Start the conversation."
      className="h-[calc(100vh-13rem)] min-h-[24rem]"
      onIncoming={markRead}
    />
  );
}
