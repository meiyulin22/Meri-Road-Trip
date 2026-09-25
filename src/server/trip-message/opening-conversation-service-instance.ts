import { interpretWorkspaceConversation } from "@/server/ai/workspace-conversation-interpreter";
import { journeyService } from "@/server/journey/journey-service-instance";
import { tripMessageService } from "./trip-message-service-instance";
import { OpeningConversationService } from "./opening-conversation-service";

export const openingConversationService = new OpeningConversationService({
  loadTripState: async (tripId, ownerGuestId) =>
    (await journeyService.loadJourney(tripId, ownerGuestId)).tripState,
  listMessages: (tripId, ownerGuestId) =>
    tripMessageService.listMessages(tripId, ownerGuestId),
  generateReply: async (input) => {
    const interpretation = await interpretWorkspaceConversation({
      ...input,
      mode: "opening",
    });
    return interpretation.reply;
  },
  persistAssistant: (input) => tripMessageService.persistOpeningAssistant(input),
});
