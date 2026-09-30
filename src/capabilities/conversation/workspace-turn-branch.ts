import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import type { DestinationEditResult } from "@/capabilities/destination/apply-destination-edit";

export type WorkspaceTurnBranch = "destination_recommendations" | "destination_choices" | "journey_update" | "conversation";

export function resolveWorkspaceTurn(input: {
  readonly interpretation: WorkspaceConversationInterpretation;
  readonly recommendationReply: string | null;
  readonly destinationResult: DestinationEditResult;
}): { readonly branch: WorkspaceTurnBranch; readonly reply: string } {
  if (input.recommendationReply !== null) {
    return { branch: "destination_recommendations", reply: input.recommendationReply };
  }
  if (input.destinationResult.choices) {
    return { branch: "destination_choices", reply:
      `找到「${input.destinationResult.choices.answering}」相关的地点了。点击添加后才会记入旅程。` };
  }
  if (input.destinationResult.ambiguousRemovals.length) {
    return { branch: "conversation", reply:
      `「${input.destinationResult.ambiguousRemovals.join("、")}」对应多个已保存地点，请说得更具体一些。` };
  }
  if (input.destinationResult.notInDestination.length) {
    return { branch: "conversation", reply:
      `当前旅程里没有找到「${input.destinationResult.notInDestination.join("、")}」。` };
  }
  if (input.destinationResult.lookupFailed.length) {
    return { branch: "conversation", reply: "地点查询暂时不可用，目的地没有改变。请稍后重试。" };
  }
  if (input.destinationResult.unresolved.length) {
    return { branch: "conversation", reply:
      `暂时没找到「${input.destinationResult.unresolved.join("、")}」的可靠地点，目的地没有因此改变。` };
  }
  return { branch: input.interpretation.changes.length || input.destinationResult.changed
    ? "journey_update" : "conversation", reply: input.interpretation.reply };
}
