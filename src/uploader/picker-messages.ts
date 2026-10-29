/**
 * Messages between the hosted Google Picker page and the extension
 * (sent with chrome.runtime.sendMessage through externally_connectable)
 */

export const DESTINATION_KEY = 'uploaderDestination';

export interface PickerInitRequest {
  type: 'PICKER_INIT';
}

export interface PickerInitResponse {
  ok: boolean;
  token?: string;
  apiKey?: string;
  appId?: string;
  error?: string;
}

export interface PickerResultMessage {
  type: 'PICKER_RESULT';
  folder: { id: string; name: string };
}

export interface PickerCancelMessage {
  type: 'PICKER_CANCEL';
}

export type PickerMessage =
  | PickerInitRequest
  | PickerResultMessage
  | PickerCancelMessage;
