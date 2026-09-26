import { randomUUID } from "node:crypto";

import {
  validateTripMessage,
  type TripMessage,
  type TripMessagePresentation,
} from "@/domain/trip-message/trip-message";
import type { TripMessageRepository } from "@/repositories/trip-message-repository";
import type { TripService } from "@/server/trip/trip-service";
import { openingAssistantMessageId } from "./opening-assistant-id";
import { destinationMissingGuidanceContent, destinationMissingGuidanceMessageId } from "./destination-missing-guidance";

type TripMessageServiceDependencies = {
  readonly tripService: Pick<TripService, "getTripById">;
  readonly repository: TripMessageRepository;
  readonly generateId?: () => string;
  readonly now?: () => Date;
};

export class TripMessageService {
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: TripMessageServiceDependencies) {
    this.generateId = dependencies.generateId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  async listMessages(
    tripId: string,
    ownerGuestId: string,
  ): Promise<TripMessage[]> {
    await this.dependencies.tripService.getTripById(tripId, ownerGuestId);
    return this.dependencies.repository.listByTripId(tripId);
  }

  async persistInitialUserMessage(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
  }): Promise<TripMessage> {
    await this.dependencies.tripService.getTripById(
      input.tripId,
      input.ownerGuestId,
    );

    const message = validateTripMessage({
      id: this.generateId(),
      tripId: input.tripId,
      role: "user",
      content: input.content,
      createdAt: this.now().toISOString(),
    });
    await this.dependencies.repository.createMessage(message);
    return message;
  }

  async persistOpeningAssistant(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
  }): Promise<TripMessage> {
    await this.dependencies.tripService.getTripById(input.tripId, input.ownerGuestId);
    const message = validateTripMessage({
      id: openingAssistantMessageId(input.tripId),
      tripId: input.tripId,
      role: "assistant",
      content: input.content,
      createdAt: this.now().toISOString(),
    });
    return this.dependencies.repository.createAssistantIfAbsent(message);
  }

  async persistDestinationMissingGuidance(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
  }): Promise<TripMessage> {
    await this.dependencies.tripService.getTripById(input.tripId, input.ownerGuestId);
    const message = validateTripMessage({
      id: destinationMissingGuidanceMessageId(input.tripId),
      tripId: input.tripId,
      role: "assistant",
      content: destinationMissingGuidanceContent,
      createdAt: this.now().toISOString(),
    });
    return this.dependencies.repository.createAssistantIfAbsent(message);
  }

  async persistSuccessfulTurn(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly userContent: string;
    readonly assistantContent: string;
    readonly assistantPresentation?: TripMessagePresentation;
  }): Promise<readonly [TripMessage, TripMessage]> {
    await this.dependencies.tripService.getTripById(
      input.tripId,
      input.ownerGuestId,
    );

    const userCreatedAt = this.now();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
    const userMessage = validateTripMessage({
      id: this.generateId(),
      tripId: input.tripId,
      role: "user",
      content: input.userContent,
      createdAt: userCreatedAt.toISOString(),
    });
    const assistantMessage = validateTripMessage({
      id: this.generateId(),
      tripId: input.tripId,
      role: "assistant",
      content: input.assistantContent,
      ...(input.assistantPresentation ? { presentation: input.assistantPresentation } : {}),
      createdAt: assistantCreatedAt.toISOString(),
    });

    await this.dependencies.repository.createTurn(
      userMessage,
      assistantMessage,
    );

    return [userMessage, assistantMessage];
  }
}
