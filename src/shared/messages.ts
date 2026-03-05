/** Message types for communication between extension components. */

export interface GetSelectionMessage {
  type: "GET_SELECTION";
}

export interface SelectionResultMessage {
  type: "SELECTION_RESULT";
  text: string;
  url: string;
  title: string;
}

export interface InsertTextMessage {
  type: "INSERT_TEXT";
  text: string;
}

export interface InsertResultMessage {
  type: "INSERT_RESULT";
  success: boolean;
}

export interface GetFormFieldsMessage {
  type: "GET_FORM_FIELDS";
  fields: { name: string; selector: string }[];
}

export interface FormFieldsResultMessage {
  type: "FORM_FIELDS_RESULT";
  fields: Record<string, string>;
}

export interface StartRecordingMessage {
  type: "START_RECORDING";
  workflowSlug: string;
}

export interface StopRecordingMessage {
  type: "STOP_RECORDING";
}

export interface CancelRecordingMessage {
  type: "CANCEL_RECORDING";
}

export interface ExecuteHotkeyWorkflowMessage {
  type: "EXECUTE_HOTKEY_WORKFLOW";
  workflowSlug: string;
  /** Hint from the content script so background can open the side panel synchronously. */
  needsSidePanel: boolean;
}

export interface ShowToastMessage {
  type: "SHOW_TOAST";
  text: string;
  variant: "processing" | "success" | "error";
  /** Auto-dismiss after ms (0 = stay until replaced). */
  duration?: number;
}

export interface HideToastMessage {
  type: "HIDE_TOAST";
}

export type ExtensionMessage =
  | GetSelectionMessage
  | SelectionResultMessage
  | InsertTextMessage
  | InsertResultMessage
  | GetFormFieldsMessage
  | FormFieldsResultMessage
  | StartRecordingMessage
  | StopRecordingMessage
  | CancelRecordingMessage
  | ExecuteHotkeyWorkflowMessage
  | ShowToastMessage
  | HideToastMessage;
