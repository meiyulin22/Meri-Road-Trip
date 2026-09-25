import { asc, eq } from "drizzle-orm";

import {
  validateTripMessage,
  type TripMessage,
} from "@/domain/trip-message/trip-message";
import type { TripMessageRepository } from "@/repositories/trip-message-repository";
import { tripMessages } from "@/server/database/schema/trip-messages";

type TripMessageDatabase = typeof import("@/server/database/db").db;
type TripMessageRow = typeof tripMessages.$inferSelect;

type PostgresTripMessageOperation = "createMessage" | "createOpeningAssistantIfAbsent" | "createTurn" | "listByTripId";

export class PostgresTripMessageRepositoryError extends Error {
  readonly operation: PostgresTripMessageOperation;
  readonly tripId: string;

  constructor(
    operation: PostgresTripMessageOperation,
    tripId: string,
    cause: unknown,
  ) {
    super(`Failed to ${operation} for Trip ${tripId}.`, { cause });
    this.name = "PostgresTripMessageRepositoryError";
    this.operation = operation;
    this.tripId = tripId;
  }
}

export class PostgresTripMessageRepository
  implements TripMessageRepository
{
  constructor(private readonly database: TripMessageDatabase) {}

  async createMessage(message: TripMessage): Promise<void> {
    try {
      await this.database.insert(tripMessages).values(toTripMessageInsert(message));
    } catch (error) {
      throw new PostgresTripMessageRepositoryError(
        "createMessage",
        message.tripId,
        error,
      );
    }
  }

  async createOpeningAssistantIfAbsent(message: TripMessage): Promise<TripMessage> {
    try {
      const inserted = await this.database
        .insert(tripMessages)
        .values(toTripMessageInsert(message))
        .onConflictDoNothing({ target: tripMessages.id })
        .returning({ id: tripMessages.id });
      if (inserted.length > 0) {
        return message;
      }

      const rows = await this.database
        .select()
        .from(tripMessages)
        .where(eq(tripMessages.id, message.id))
        .limit(1);
      const winner = rows[0] ? toTripMessage(rows[0]) : null;
      if (!winner || winner.tripId !== message.tripId || winner.role !== "assistant") {
        throw new Error("Opening assistant ID conflicts with an unrelated message.");
      }
      return winner;
    } catch (error) {
      throw new PostgresTripMessageRepositoryError(
        "createOpeningAssistantIfAbsent",
        message.tripId,
        error,
      );
    }
  }

  async createTurn(
    userMessage: TripMessage,
    assistantMessage: TripMessage,
  ): Promise<void> {
    try {
      await this.database.insert(tripMessages).values([
        toTripMessageInsert(userMessage),
        toTripMessageInsert(assistantMessage),
      ]);
    } catch (error) {
      throw new PostgresTripMessageRepositoryError(
        "createTurn",
        userMessage.tripId,
        error,
      );
    }
  }

  async listByTripId(tripId: string): Promise<TripMessage[]> {
    try {
      const rows = await this.database
        .select()
        .from(tripMessages)
        .where(eq(tripMessages.tripId, tripId))
        .orderBy(asc(tripMessages.createdAt), asc(tripMessages.id));

      return rows.map(toTripMessage);
    } catch (error) {
      throw new PostgresTripMessageRepositoryError(
        "listByTripId",
        tripId,
        error,
      );
    }
  }
}

function toTripMessageInsert(message: TripMessage) {
  return {
    id: message.id,
    tripId: message.tripId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function toTripMessage(row: TripMessageRow): TripMessage {
  return validateTripMessage({
    id: row.id,
    tripId: row.tripId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  });
}
