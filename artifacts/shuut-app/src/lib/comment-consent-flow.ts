export type CommentConsentDecision = "accepted" | "declined";

type CommentConsentActions = {
  closeDisclosure: () => void;
  dismissComposer: () => void;
  startRecording: () => void;
};

export function applyCommentConsentDecision(
  decision: CommentConsentDecision,
  actions: CommentConsentActions,
) {
  actions.closeDisclosure();
  if (decision === "accepted") {
    actions.startRecording();
    return;
  }
  actions.dismissComposer();
}