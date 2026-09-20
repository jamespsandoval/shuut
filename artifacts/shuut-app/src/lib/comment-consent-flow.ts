export type CommentConsentDecision = "accepted" | "declined";
export type CommentAutoStartAction = "wait-for-consent" | "start" | "skip";

export function getCommentAutoStartAction(
  autoStart: boolean,
  alreadyStarted: boolean,
  consentLoading: boolean,
): CommentAutoStartAction {
  if (!autoStart || alreadyStarted) return "skip";
  if (consentLoading) return "wait-for-consent";
  return "start";
}

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